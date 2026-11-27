import { Op } from 'sequelize';
import { CcareLog, Event, ServerLog } from '../models/index.js';
import { logCcare, PROTECTED_ACTIONS } from './ccare-log.service.js';

/** How old (in days) logs must be to be deleted with "Delete old logs". */
export const CLEANUP_DAYS = Object.freeze([1, 5, 7, 14, 30, 60, 90]);

/**
 * The three logs of the Logs page. Each clean-up is itself recorded in the audit
 * log (an entry that can never be deleted), with who did it and how many went.
 */
const KINDS = {
  mytplus: { model: Event, field: 'occurredAt', audit: 'events_purged', label: 'MyTPlus app logs' },
  // Records of deletes always stay.
  ccare: { model: CcareLog, field: 'at', audit: 'logs_cleared', label: 'CCare logs', keep: PROTECTED_ACTIONS },
  server: { model: ServerLog, field: 'at', audit: 'server_logs_purged', label: 'Server logs' },
};

function whereFor(kind, days) {
  const k = KINDS[kind];
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const where = { [k.field]: { [Op.lt]: cutoff } };
  if (k.keep) where.action = { [Op.notIn]: k.keep };
  return { k, where, cutoff };
}

/** How many entries a clean-up would delete (shown before confirming). */
export async function preview(kind, days) {
  const { k, where, cutoff } = whereFor(kind, days);
  return { kind, days, cutoff: cutoff.toISOString(), count: await k.model.count({ where }) };
}

/** Deletes the entries older than `days` days and records who did it. */
export async function cleanup(kind, days, { by, ip }) {
  const { k, where, cutoff } = whereFor(kind, days);
  const removed = await k.model.destroy({ where });
  await logCcare({
    name: by,
    action: k.audit,
    success: true,
    actor: by,
    ip,
    detail: { deletedBy: by, log: k.label, olderThanDays: days, olderThan: cutoff.toISOString(), deleted: removed },
  });
  return { kind, days, removed, cutoff: cutoff.toISOString() };
}
