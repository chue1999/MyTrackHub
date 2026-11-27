import { Op, QueryTypes } from 'sequelize';
import { isMssql, sequelize } from '../db/index.js';
import { Event, Setting } from '../models/index.js';
import { logCcare } from './ccare-log.service.js';
import { logger } from '../utils/logger.js';

/**
 * Automatic deletion of old logs ("Auto delete old logs" on the Settings page).
 * The setting lives in the `settings` table so admins can change it at runtime.
 */

const SETTING_KEY = 'logRetention';
const DELETE_BATCH_SIZE = 5000;
// A period is either `days` (short) or `months`; `days` wins when set.
const DEFAULTS = Object.freeze({ enabled: true, months: 4, days: null, lastRun: null });

export const RETENTION_DAYS = Object.freeze([1, 5, 7, 14]);
export const RETENTION_MONTHS = Object.freeze([1, 2, 3, 4, 6, 9, 12, 18, 24, 36]);

/** "7 days" / "3 months" */
export const periodText = ({ days, months }) =>
  days ? `${days} day${days === 1 ? '' : 's'}` : `${months} month${months === 1 ? '' : 's'}`;

/** @type {Promise<{skipped: boolean, settings: object}> | null} */
let runningCleanup = null;

export async function getRetention() {
  const row = await Setting.findByPk(SETTING_KEY);
  return { ...DEFAULTS, ...(row?.value ?? {}) };
}

async function saveRetention(patch) {
  const next = { ...(await getRetention()), ...patch };
  await Setting.upsert({ key: SETTING_KEY, value: next });
  return next;
}

/**
 * Everything before this is deleted: N days ago (to the minute) for a days
 * period, or the start of the day N months ago.
 */
export function cutoffFor({ days, months }, now = new Date()) {
  if (days) return new Date(now.getTime() - days * 86_400_000);
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setMonth(d.getMonth() - months);
  return d;
}

/** Deletes old events in small batches so the table is never locked for long. */
async function deleteOlderThan(cutoff) {
  let total = 0;
  for (;;) {
    const [row] = await sequelize.query(
      isMssql
        ? `DELETE TOP (${DELETE_BATCH_SIZE}) FROM events WHERE occurred_at < :cutoff; SELECT @@ROWCOUNT AS deleted;`
        : `WITH gone AS (DELETE FROM events WHERE id IN
             (SELECT id FROM events WHERE occurred_at < :cutoff LIMIT ${DELETE_BATCH_SIZE}) RETURNING 1)
           SELECT COUNT(*) AS deleted FROM gone`,
      { replacements: { cutoff }, type: QueryTypes.SELECT },
    );
    const deleted = Number(row?.deleted ?? 0);
    total += deleted;
    if (deleted < DELETE_BATCH_SIZE) return total;
  }
}

/**
 * Runs one clean-up. `force` runs even when auto delete is switched off
 * (the "Delete now" button). Concurrent calls share the same run.
 */
export function runCleanup({ force = false, by = 'auto' } = {}) {
  if (runningCleanup) return runningCleanup;
  runningCleanup = (async () => {
    const settings = await getRetention();
    if (!settings.enabled && !force) return { skipped: true, settings };
    const cutoff = cutoffFor(settings);
    const startedAt = Date.now();
    const deleted = await deleteOlderThan(cutoff);
    const lastRun = {
      at: new Date().toISOString(),
      deleted,
      cutoff: cutoff.toISOString(),
      months: settings.days ? null : settings.months,
      days: settings.days ?? null,
      period: periodText(settings),
      by,
      ms: Date.now() - startedAt,
    };
    if (deleted) {
      logger.info({ deleted, period: periodText(settings), cutoff }, 'Retention: deleted old events');
      // Recorded in the audit log: who (or 'auto') deleted how many app events.
      await logCcare({
        name: by,
        action: 'events_purged',
        success: true,
        actor: by,
        detail: { deletedBy: by, deleted, olderThan: cutoff.toISOString(), period: periodText(settings) },
      });
    }
    return { skipped: false, settings: await saveRetention({ lastRun }) };
  })().finally(() => {
    runningCleanup = null;
  });
  return runningCleanup;
}

/** Settings plus live numbers for the Settings page (optionally previewing another period). */
export async function getRetentionInfo({ settings, preview: ask } = {}) {
  const current = settings ?? (await getRetention());
  const period = ask?.days || ask?.months ? ask : { days: current.days, months: current.months };
  const cutoff = cutoffFor(period);
  const [total, oldest, willDelete] = await Promise.all([
    Event.count(),
    Event.min('occurredAt'),
    Event.count({ where: { occurredAt: { [Op.lt]: cutoff } } }),
  ]);
  return {
    ...current,
    monthOptions: RETENTION_MONTHS,
    dayOptions: RETENTION_DAYS,
    preview: { months: period.days ? null : period.months, days: period.days ?? null, cutoff, willDelete },
    total,
    oldest: oldest ?? null,
  };
}

/** Saves the setting and, when enabled, applies it straight away. */
export async function updateRetention({ enabled, months, days }, by) {
  const saved = await saveRetention({
    enabled,
    days: days ?? null,
    months: days ? ((await getRetention()).months ?? DEFAULTS.months) : months,
    updatedAt: new Date().toISOString(),
    updatedBy: by,
  });
  const run = enabled ? await runCleanup({ by }) : null;
  return getRetentionInfo({ settings: run?.settings ?? saved });
}

/** "Delete old logs now". */
export async function runCleanupNow(by) {
  const run = await runCleanup({ force: true, by });
  return getRetentionInfo({ settings: run.settings });
}
