import { Op } from 'sequelize';
import { CcareLog } from '../models/index.js';
import { logger } from '../utils/logger.js';

/**
 * Writes one audit entry for the CCare portal. Never throws: a logging failure
 * must not break the action it records.
 */
export async function logCcare(entry) {
  try {
    await CcareLog.create({ at: new Date(), success: true, ...entry });
  } catch (err) {
    logger.warn({ err: err.message, action: entry?.action }, 'CCare log write failed');
  }
}

/**
 * MyTPlus system deletes (admin accounts, event clean-up, SQL console). Kept in
 * the same audit table but only MyTPlus administrators see them.
 */
export const SYSTEM_ACTIONS = ['admin_account_delete', 'events_purged', 'sql_delete'];
/** Entries that record a delete can never be deleted themselves. */
export const PROTECTED_ACTIONS = ['log_deleted', 'logs_cleared', ...SYSTEM_ACTIONS];

/** Extra where-clause that hides MyTPlus system entries from CCare accounts. */
const scopeWhere = (hideSystem) => (hideSystem ? { action: { [Op.notIn]: SYSTEM_ACTIONS } } : {});

/** The client IP for an audit entry (behind nginx we trust the proxy). */
export const ipOf = (req) => req.ip || req.get('x-forwarded-for') || null;

/** A page of audit entries, newest first, for the CCare Activity log page. */
export async function listLogs({ search = '', action, userId, page = 1, pageSize = 50, hideSystem = false }) {
  const where = { ...scopeWhere(hideSystem) };
  if (action) where.action = hideSystem && SYSTEM_ACTIONS.includes(action) ? '__none__' : action;
  if (userId) where.ccareUserId = Number(userId);
  if (search) {
    where[Op.or] = [{ name: { [Op.like]: `%${search}%` } }, { actor: { [Op.like]: `%${search}%` } }];
  }
  const { rows, count } = await CcareLog.findAndCountAll({
    where,
    order: [['at', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  return { rows, total: count, page, pageSize };
}

/** One audit entry by id, for the CCare activity detail page (null if missing). */
export async function getLog(id, { hideSystem = false } = {}) {
  const row = await CcareLog.findByPk(Number(id));
  if (row && hideSystem && SYSTEM_ACTIONS.includes(row.action)) return null;
  return row;
}

/**
 * Delete one audit entry. Returns the removed row (so the caller can record
 * what was deleted), null if missing, or 'protected' for a delete record.
 */
export async function deleteLog(id, { hideSystem = false } = {}) {
  const row = await getLog(id, { hideSystem });
  if (!row) return null;
  if (PROTECTED_ACTIONS.includes(row.action)) return 'protected';
  await row.destroy();
  return row;
}

/**
 * Bulk-delete audit entries, optionally only an action, only a user's, and/or
 * only those older than a cut-off date. With no filter it clears the whole log.
 * Returns the number of rows removed.
 */
export async function clearLogs({ action, userId, before } = {}) {
  // Delete records (and MyTPlus system entries) always survive a clear.
  const where = { action: { [Op.notIn]: PROTECTED_ACTIONS } };
  if (action) where.action = PROTECTED_ACTIONS.includes(action) ? '__none__' : action;
  if (userId) where.ccareUserId = Number(userId);
  if (before) {
    const d = new Date(before);
    if (!Number.isNaN(d.getTime())) where.at = { [Op.lt]: d };
  }
  return CcareLog.destroy({ where });
}

/** Per-user headline counts for the CCare user detail page. */
export async function userSummary(userId) {
  const id = Number(userId);
  const where = { ccareUserId: id };
  const [actions, logins, failed, last] = await Promise.all([
    CcareLog.count({ where }),
    CcareLog.count({ where: { ...where, action: 'login_ok' } }),
    CcareLog.count({ where: { ...where, action: { [Op.in]: ['login_fail', 'otp_fail', 'otp_expired'] } } }),
    CcareLog.findOne({ where, order: [['at', 'DESC']], attributes: ['at'] }),
  ]);
  return { actions, logins, failed, lastAt: last?.at ?? null };
}

/** The distinct action names present, for the filter dropdown. */
export async function listActions({ hideSystem = false } = {}) {
  const rows = await CcareLog.findAll({
    attributes: ['action'],
    where: scopeWhere(hideSystem),
    group: ['action'],
    order: [['action', 'ASC']],
  });
  return rows.map((r) => r.action);
}

/** Headline counts for the activity page (all time + today). */
export async function summary({ hideSystem = false } = {}) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const today = { at: { [Op.gte]: startOfToday } };
  const count = (where = {}) => CcareLog.count({ where: { ...scopeWhere(hideSystem), ...where } });
  const [total, signInsToday, failedToday, changesToday] = await Promise.all([
    count(),
    count({ ...today, action: 'login_ok' }),
    count({ ...today, action: { [Op.in]: ['login_fail', 'otp_fail', 'otp_expired', 'otp_blocked'] } }),
    count({
      ...today,
      action: {
        [Op.in]: [
          'account_create',
          'account_update',
          'account_close',
          'account_reopen',
          'password_reset_by_admin',
          'password_reset',
        ],
      },
    }),
  ]);
  return { total, signInsToday, failedToday, changesToday };
}
