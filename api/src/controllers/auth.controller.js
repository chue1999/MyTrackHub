import * as authService from '../services/auth.service.js';

/** POST /auth/login */
export async function login(req, res) {
  res.json(await authService.login(req.body));
}

/** GET /auth/me */
export function me(req, res) {
  res.json(req.me);
}

/** POST /auth/password */
export async function changePassword(req, res) {
  await authService.changePassword(req.me.id, req.body);
  res.json({ ok: true });
}
