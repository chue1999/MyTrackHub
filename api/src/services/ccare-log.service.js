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

/** The client IP for an audit entry (behind nginx we trust the proxy). */
export const ipOf = (req) => req.ip || req.get('x-forwarded-for') || null;

/** A page of audit entries, newest first, for the CCare Activity log page. */
export async function listLogs({ search = '', action, page = 1, pageSize = 50 }) {
  const where = {};
  if (action) where.action = action;
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

/** The distinct action names present, for the filter dropdown. */
export async function listActions() {
  const rows = await CcareLog.findAll({ attributes: ['action'], group: ['action'], order: [['action', 'ASC']] });
  return rows.map((r) => r.action);
}

/** Headline counts for the activity page (all time + today). */
export async function summary() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const today = { at: { [Op.gte]: startOfToday } };
  const count = (where) => CcareLog.count({ where });
  const [total, signInsToday, failedToday, changesToday] = await Promise.all([
    count(),
    count({ ...today, action: 'login_ok' }),
    count({ ...today, action: { [Op.in]: ['login_fail', 'otp_fail', 'otp_expired', 'otp_blocked'] } }),
    count({
      ...today,
      action: { [Op.in]: ['account_create', 'account_update', 'account_close', 'account_reopen', 'password_reset_by_admin', 'password_reset'] },
    }),
  ]);
  return { total, signInsToday, failedToday, changesToday };
}
