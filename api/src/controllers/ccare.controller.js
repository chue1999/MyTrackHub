import { getLog, ipOf, listActions, listLogs, logCcare, summary, userSummary } from '../services/ccare-log.service.js';
import { HttpError } from '../utils/http-error.js';
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

/** GET /ccare/users/:id/detail — account + its activity summary (MyTPlus-style page). */
export async function detail(req, res) {
  const id = Number(req.params.id);
  const [user, s] = await Promise.all([ccare.getById(id), userSummary(id)]);
  res.json({ user, summary: s });
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

/**
 * POST /ccare/vas/submit — a Vas Service operation. For now it only records who
 * asked for what (telecom wiring comes later), so staff actions are audited.
 */
export async function vasSubmit(req, res) {
  const { group, operation, fields } = req.body;
  await logCcare({
    ccareUserId: req.me.kind === 'ccare' ? req.me.id : null,
    name: req.me.username,
    action: 'vas',
    success: true,
    actor: req.me.username,
    ip: ipOf(req),
    detail: { group, operation, ...fields },
  });
  res.json({
    ok: true,
    logged: true,
    connected: false,
    message: 'Request recorded. The telecom connection is not enabled yet.',
  });
}

/** GET /ccare/logs — the CCare activity log (newest first). */
export async function logs(req, res) {
  res.json(await listLogs(req.validatedQuery));
}

/** GET /ccare/logs/:id — one audit entry in full, for the activity detail page. */
export async function logDetail(req, res) {
  const row = await getLog(req.params.id);
  if (!row) throw HttpError.notFound('This activity entry was not found.');
  res.json(row);
}

/** GET /ccare/log-actions — distinct action names for the filter. */
export async function logActions(_req, res) {
  res.json(await listActions());
}

/** GET /ccare/logs/summary — headline counts for the activity page. */
export async function logSummary(_req, res) {
  res.json(await summary());
}
