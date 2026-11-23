import { ipOf, listActions, listLogs, logCcare, summary } from '../services/ccare-log.service.js';
import * as ccare from '../services/ccare.service.js';

/** Writes an audit entry for a management action (by an admin or a CCare manager). */
const audit = (req, action, user, detail) =>
  logCcare({
    ccareUserId: user?.id,
    name: user?.name,
    action,
    success: true,
    actor: req.me.username,
    ip: ipOf(req),
    detail,
  });

/** GET /ccare/users?search= */
export async function list(req, res) {
  res.json(await ccare.list(req.validatedQuery));
}

/** GET /ccare/users/:id */
export async function get(req, res) {
  res.json(await ccare.getById(Number(req.params.id)));
}

/** POST /ccare/users */
export async function create(req, res) {
  const user = await ccare.create(req.body);
  await audit(req, 'account_create', user);
  res.status(201).json(user);
}

/** PATCH /ccare/users/:id */
export async function update(req, res) {
  const user = await ccare.update(Number(req.params.id), req.body);
  await audit(req, 'account_update', user, { fields: Object.keys(req.body) });
  res.json(user);
}

/** POST /ccare/users/:id/password */
export async function resetPassword(req, res) {
  const user = await ccare.resetPassword(Number(req.params.id), req.body.newPassword);
  await audit(req, 'password_reset_by_admin', user);
  res.json(user);
}

/** POST /ccare/users/:id/active */
export async function setActive(req, res) {
  const user = await ccare.setActive(Number(req.params.id), req.body.active);
  await audit(req, req.body.active ? 'account_reopen' : 'account_close', user);
  res.json(user);
}

/** GET /ccare/logs — the CCare activity log (newest first). */
export async function logs(req, res) {
  res.json(await listLogs(req.validatedQuery));
}

/** GET /ccare/log-actions — distinct action names for the filter. */
export async function logActions(_req, res) {
  res.json(await listActions());
}

/** GET /ccare/logs/summary — headline counts for the activity page. */
export async function logSummary(_req, res) {
  res.json(await summary());
}
