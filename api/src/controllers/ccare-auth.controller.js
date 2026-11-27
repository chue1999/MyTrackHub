import * as ccareAuth from '../services/ccare-auth.service.js';
import { ipOf, logCcare } from '../services/ccare-log.service.js';
import * as ccare from '../services/ccare.service.js';
import { HttpError } from '../utils/http-error.js';

/** POST /auth/ccare/start — name + password → send an SMS code. */
export async function start(req, res) {
  res.json(await ccareAuth.startLogin({ ...req.body, ip: ipOf(req) }));
}

/** POST /auth/ccare/verify — the code → a login token. */
export async function verify(req, res) {
  res.json(await ccareAuth.verifyLogin({ ...req.body, ip: ipOf(req) }));
}

/** POST /auth/ccare/forgot — name → send an SMS code to reset the password. */
export async function forgot(req, res) {
  res.json(await ccareAuth.startForgot({ ...req.body, ip: ipOf(req) }));
}

/** POST /auth/ccare/reset/check — is the SMS code right? → a ticket for setting the new password. */
export async function resetCheck(req, res) {
  res.json(await ccareAuth.checkResetCode({ ...req.body, ip: ipOf(req) }));
}

/** POST /auth/ccare/reset — ticket (or code) + new password. */
export async function reset(req, res) {
  await ccareAuth.resetPassword({ ...req.body, ip: ipOf(req) });
  res.json({ ok: true });
}

/** GET /auth/ccare/config — what the sign-in portal may offer (depends on auth mode). */
export function config(_req, res) {
  res.json(ccareAuth.portalConfig());
}

/** POST /auth/ccare/register — "Create account" on the CCare portal (role 'user'). */
export async function register(req, res) {
  if (!ccareAuth.portalConfig().canRegister) {
    throw HttpError.badRequest('New accounts are created in the My CCare system.');
  }
  const user = await ccare.create({ ...req.body, descrip: 'user' });
  await logCcare({
    ccareUserId: user.id,
    name: user.name,
    action: 'account_create',
    success: true,
    ip: ipOf(req),
    detail: { self: true },
  });
  res.status(201).json(user);
}
