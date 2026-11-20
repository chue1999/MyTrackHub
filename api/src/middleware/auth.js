import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** The Flutter app authenticates with a shared key in the x-api-key header. */
export function requireAppKey(req, res, next) {
  const key = req.get('x-api-key');
  if (!key || !safeEqual(key, config.appApiKey)) {
    return res.status(401).json({ message: 'Invalid API key' });
  }
  next();
}

/** Admin website requests carry "Authorization: Bearer <jwt>". */
export function requireAdmin(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Not logged in' });
  try {
    req.admin = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    res.status(401).json({ message: 'Session expired, please log in again' });
  }
}

export function signAdminToken(admin) {
  return jwt.sign({ sub: admin.id, username: admin.username, role: admin.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}
