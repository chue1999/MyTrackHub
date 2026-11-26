import { config } from '../config/index.js';
import { Setting } from '../models/index.js';
import { logger } from '../utils/logger.js';

/**
 * CCare password expiry: a password is valid for PASSWORD_MAX_AGE_DAYS (30)
 * after it was last set (Tb_User_detail.TimeResetPassWord, or the account's
 * creation date). After that, sign-in is refused until the person sets a new
 * one with "Forgot password" (SMS code) or an admin sends a new one.
 *
 * Existing staff are not locked out on day one: passwords set before the day
 * this rule was switched on count as set on that day (a 30-day grace period).
 * That day is stored once in the settings table.
 */
const SETTING_KEY = 'ccare_password_expiry_from';
const DAY = 86_400_000;
let startedAt = null;

async function expiryStart() {
  if (startedAt) return startedAt;
  try {
    let row = await Setting.findByPk(SETTING_KEY);
    if (!row) {
      row = await Setting.create({ key: SETTING_KEY, value: { from: new Date().toISOString() } });
      logger.info(`CCare password expiry switched on from ${row.value.from}`);
    }
    startedAt = new Date(row.value.from);
  } catch (err) {
    // Another request created it at the same moment: read it back.
    const row = await Setting.findByPk(SETTING_KEY);
    if (!row) throw err;
    startedAt = new Date(row.value.from);
  }
  return startedAt;
}

/**
 * Expiry of a CCare account's password.
 * @param {{ passwordChangedAt?: string|Date|null }} user  public account (from ccare.service)
 */
export async function passwordStatus(user) {
  const days = config.ccarePasswordMaxAgeDays;
  if (!days) return { expiresAt: null, expired: false, daysLeft: null, maxAgeDays: 0 };
  const start = await expiryStart();
  const changed = user?.passwordChangedAt ? new Date(user.passwordChangedAt) : null;
  const from = !changed || Number.isNaN(changed.getTime()) || changed < start ? start : changed;
  const expiresAt = new Date(from.getTime() + days * DAY);
  const left = expiresAt.getTime() - Date.now();
  return {
    expiresAt: expiresAt.toISOString(),
    expired: left <= 0,
    daysLeft: Math.max(0, Math.ceil(left / DAY)),
    maxAgeDays: days,
  };
}
