import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';
import { Admin } from '../models/index.js';
import { HttpError } from '../utils/http-error.js';
import { signToken } from '../utils/jwt.js';
import { logger } from '../utils/logger.js';
import * as ccare from './ccare.service.js';

export const BCRYPT_ROUNDS = 10;
export const hashPassword = (password) => bcrypt.hash(password, BCRYPT_ROUNDS);

/** What the website keeps about the logged-in person (MyTPlus admins). */
function adminIdentity(admin) {
  return { id: admin.id, username: admin.username, displayName: admin.displayName, role: admin.role, kind: 'admin' };
}

/**
 * MyTPlus admin sign-in (admins table, bcrypt) — username + password only.
 * CCare staff sign in separately with an SMS code (see ccare-auth.service.js);
 * if a CCare name is typed here, send the person to their own portal.
 */
export async function login({ username, password }) {
  const admin = await Admin.scope('withPassword').findOne({ where: { username } });
  if (!admin) {
    if (await ccare.getByName(username)) {
      throw new HttpError(409, 'This is a CCare account. Please use the CCare sign-in page.', 'USE_CCARE_PORTAL');
    }
    throw new HttpError(401, 'Wrong username or password', 'INVALID_CREDENTIALS');
  }
  if (!(await bcrypt.compare(password, admin.passwordHash))) {
    throw new HttpError(401, 'Wrong username or password', 'INVALID_CREDENTIALS');
  }
  if (!admin.isActive) throw new HttpError(403, 'This account is disabled. Ask an administrator.', 'ACCOUNT_DISABLED');
  await admin.update({ lastLoginAt: new Date() });
  const identity = adminIdentity(admin);
  return { token: signToken(identity), admin: identity };
}

/** Admins change their own password (CCare passwords are reset from the CCare page). */
export async function changePassword(adminId, { currentPassword, newPassword }) {
  const me = await Admin.scope('withPassword').findByPk(adminId);
  if (!me || !(await bcrypt.compare(currentPassword, me.passwordHash))) {
    throw HttpError.badRequest('Current password is wrong');
  }
  await me.update({ passwordHash: await hashPassword(newPassword) });
}

/** On first start, creates the admin account from ADMIN_USERNAME / ADMIN_PASSWORD. */
export async function ensureFirstAdmin() {
  if ((await Admin.count()) > 0) return;
  const { username, password } = config.firstAdmin;
  if (!password || password.startsWith('change-me')) {
    logger.warn('No admin account yet. Set ADMIN_USERNAME / ADMIN_PASSWORD in .env and restart.');
    return;
  }
  await Admin.create({ username, passwordHash: await hashPassword(password), displayName: 'Administrator' });
  logger.info(`Created admin account "${username}"`);
}
