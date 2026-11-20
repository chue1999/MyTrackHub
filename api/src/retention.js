import { Op } from 'sequelize';
import { sequelize } from './db.js';
import { Event, Setting } from './models/index.js';

const KEY = 'logRetention';
export const RETENTION_MONTHS = [1, 2, 3, 4, 6, 9, 12, 18, 24, 36];
const DEFAULTS = { enabled: true, months: 4, lastRun: null };
const BATCH = 5000;
let running = null;

export async function getRetention() {
  const row = await Setting.findByPk(KEY);
  return { ...DEFAULTS, ...(row?.value ?? {}) };
}

export async function saveRetention(patch) {
  const next = { ...(await getRetention()), ...patch };
  await Setting.upsert({ key: KEY, value: next });
  return next;
}

/** Start of the day N months ago: everything before it is deleted. */
export function cutoffFor(months, now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setMonth(d.getMonth() - months);
  return d;
}

export async function countOlderThan(cutoff) {
  return Event.count({ where: { occurredAt: { [Op.lt]: cutoff } } });
}

/** Deletes old events in small batches so the table never locks for long. */
async function deleteOlderThan(cutoff) {
  let total = 0;
  for (;;) {
    const [, meta] = await sequelize.query(
      `DELETE FROM events WHERE id IN (SELECT id FROM events WHERE occurred_at < :cutoff LIMIT ${BATCH})`,
      { replacements: { cutoff } },
    );
    const n = meta?.rowCount ?? 0;
    total += n;
    if (n < BATCH) return total;
  }
}

/**
 * Runs one clean-up. `force` runs even when auto delete is switched off
 * (the "Delete now" button). Only one run at a time.
 */
export function runRetention({ force = false, by = 'auto' } = {}) {
  if (running) return running;
  running = (async () => {
    const s = await getRetention();
    if (!s.enabled && !force) return { skipped: true, settings: s };
    const cutoff = cutoffFor(s.months);
    const started = Date.now();
    const deleted = await deleteOlderThan(cutoff);
    const lastRun = { at: new Date().toISOString(), deleted, cutoff: cutoff.toISOString(), months: s.months, by, ms: Date.now() - started };
    if (deleted) console.log(`Retention: deleted ${deleted} events older than ${s.months} months (${cutoff.toISOString()})`);
    return { skipped: false, settings: await saveRetention({ lastRun }) };
  })().finally(() => (running = null));
  return running;
}

export function scheduleRetention() {
  const tick = () => runRetention().catch((e) => console.error('Retention failed:', e.message));
  setTimeout(tick, 10_000).unref();
  setInterval(tick, 60 * 60 * 1000).unref();
}
