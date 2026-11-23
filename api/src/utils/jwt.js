import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

/**
 * Signs the admin website's login token.
 * `kind` tells the two account sources apart: 'admin' (the admins table) or
 * 'ccare' (the Tb_User_detail staff table). Old tokens without it are 'admin'.
 */
export function signToken({ id, username, role, kind = 'admin' }) {
  return jwt.sign({ sub: id, username, role, kind }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

/** Back-compat: an Admin row signs an 'admin' token. */
export const signAdminToken = (admin) => signToken({ id: admin.id, username: admin.username, role: admin.role });

/** Returns the token's claims, or throws if it is invalid or expired. */
export const verifyAdminToken = (token) => jwt.verify(token, config.jwt.secret);
