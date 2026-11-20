import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

/** Signs the admin website's login token. */
export function signAdminToken(admin) {
  return jwt.sign({ sub: admin.id, username: admin.username, role: admin.role }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

/** Returns the token's claims, or throws if it is invalid or expired. */
export const verifyAdminToken = (token) => jwt.verify(token, config.jwt.secret);
