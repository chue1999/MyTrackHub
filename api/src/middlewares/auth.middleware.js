import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { Admin } from '../models/index.js';
import * as ccare from '../services/ccare.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { HttpError } from '../utils/http-error.js';
import { verifyAdminToken } from '../utils/jwt.js';

/** Constant-time string comparison (avoids leaking the key through timing). */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** The mobile app authenticates with a shared key in the `x-api-key` header. */
export function requireAppKey(req, _res, next) {
  const key = req.get('x-api-key');
  if (!key || !safeEqual(key, config.appApiKey)) throw new HttpError(401, 'Invalid API key');
  next();
}

/**
 * Admin website requests carry `Authorization: Bearer <jwt>`.
 * The account is re-read on every request, so a disabled or deleted account
 * loses access immediately (not only when its token expires).
 * Sets `req.admin` (token claims), `req.me` (role + identity for route guards)
 * and `req.identity` (what /auth/me returns). `kind` is 'admin' (admins table)
 * or 'ccare' (Tb_User_detail staff).
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw HttpError.unauthorized('Not logged in');
  try {
    req.admin = verifyAdminToken(token);
  } catch {
    throw HttpError.unauthorized('Session expired, please log in again');
  }

  if (req.admin.kind === 'ccare') {
    const user = await ccare.getActiveById(req.admin.sub);
    if (!user) throw HttpError.unauthorized('Account disabled');
    req.me = {
      id: user.id,
      username: user.name,
      displayName: user.nameLa || user.name,
      role: 'ccare',
      kind: 'ccare',
      canManage: user.canManage,
    };
    req.identity = { ...req.me, staffId: user.staffId, division: user.division };
    return next();
  }

  const me = await Admin.findByPk(req.admin.sub);
  if (!me || !me.isActive) throw HttpError.unauthorized('Account disabled');
  me.kind = 'admin';
  req.me = me;
  req.identity = { id: me.id, username: me.username, displayName: me.displayName, role: me.role, kind: 'admin' };
  next();
});

/** Only lets through admins with one of the given roles. Use after `authenticate`. */
export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!roles.includes(req.me?.role)) throw HttpError.forbidden('Only administrators can do this');
    next();
  };

/**
 * May change CCare accounts: a MyTPlus administrator, or a CCare account marked
 * as a manager (Descrip = 'Admin'). Viewers and ordinary CCare staff may not.
 */
export const requireCcareManage = (req, _res, next) => {
  const ok = (req.me?.kind === 'admin' && req.me.role === 'admin') || (req.me?.kind === 'ccare' && req.me.canManage);
  if (!ok) throw HttpError.forbidden('Only a CCare administrator can change accounts');
  next();
};
