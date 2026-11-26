import {
  clearLogs,
  deleteLog,
  getLog,
  ipOf,
  listActions,
  listLogs,
  logCcare,
  summary,
  userSummary,
} from '../services/ccare-log.service.js';
import { CCARE_BRANDS } from '../data/ccare-brands.js';
import { assertCanText, deliverPassword } from '../services/ccare-auth.service.js';
import { passwordStatus } from '../services/ccare-password-policy.service.js';
import { HttpError } from '../utils/http-error.js';
import { generatePassword } from '../utils/password.js';
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

/** GET /ccare/brands — branch list for the BrandID dropdown. */
export function brands(_req, res) {
  res.json(CCARE_BRANDS);
}

/** GET /ccare/users?search= */
export async function list(req, res) {
  const page = await ccare.list(req.validatedQuery);
  // When each password expires (30-day rule), for the "Password" column.
  page.rows = await Promise.all(page.rows.map(async (u) => ({ ...u, password: await passwordStatus(u) })));
  res.json(page);
}

/** GET /ccare/users/:id */
export async function get(req, res) {
  res.json(await ccare.getById(Number(req.params.id)));
}

/** GET /ccare/users/:id/detail — account + its activity summary (MyTPlus-style page). */
export async function detail(req, res) {
  const id = Number(req.params.id);
  const [user, s] = await Promise.all([ccare.getById(id), userSummary(id)]);
  res.json({ user: { ...user, password: await passwordStatus(user) }, summary: s });
}

/**
 * POST /ccare/users — the system generates the password (8 characters: upper,
 * lower, digit) and texts it to the staff phone. Nobody types or sees it.
 */
export async function create(req, res) {
  assertCanText(req.body.staffTel); // check before creating anything
  const password = generatePassword();
  const user = await ccare.create({ ...req.body, password });
  await audit(req, 'account_create', user);
  let delivery;
  try {
    delivery = await deliverPassword({ user, password, reason: 'create', actor: req.me.username, ip: ipOf(req) });
  } catch (err) {
    // The account exists; the admin can resend with "Send new password".
    return res.status(201).json({ ...user, passwordSent: false, passwordError: err.message });
  }
  res.status(201).json({ ...user, passwordSent: delivery.sent !== false || !!delivery.devPassword, ...delivery });
}

/** PATCH /ccare/users/:id */
export async function update(req, res) {
  const user = await ccare.update(Number(req.params.id), req.body);
  await audit(req, 'account_update', user, { fields: Object.keys(req.body) });
  res.json(user);
}

/**
 * POST /ccare/users/:id/password — a new generated password, texted to the
 * staff phone (also reopens a closed account).
 */
export async function resetPassword(req, res) {
  const id = Number(req.params.id);
  const current = await ccare.getById(id);
  if (!current.staffTel) {
    throw HttpError.badRequest('This account has no phone number. Add it with Edit, then send a new password.');
  }
  assertCanText(current.staffTel);
  const password = generatePassword();
  const user = await ccare.resetPassword(id, password);
  await audit(req, 'password_reset_by_admin', user);
  const delivery = await deliverPassword({ user, password, reason: 'reset', actor: req.me.username, ip: ipOf(req) });
  res.json({ ...user, passwordSent: delivery.sent !== false || !!delivery.devPassword, ...delivery });
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

// CCare accounts never see MyTPlus system entries (admin accounts, SQL, clean-up).
const hideSystem = (req) => req.me?.kind === 'ccare';

/** GET /ccare/logs — the CCare activity log (newest first). */
export async function logs(req, res) {
  res.json(await listLogs({ ...req.validatedQuery, hideSystem: hideSystem(req) }));
}

/** GET /ccare/logs/:id — one audit entry in full, for the activity detail page. */
export async function logDetail(req, res) {
  const row = await getLog(req.params.id, { hideSystem: hideSystem(req) });
  if (!row) throw HttpError.notFound('This activity entry was not found.');
  res.json(row);
}

/**
 * DELETE /ccare/logs/:id — remove one activity entry (manager only). A full copy
 * of the removed entry and who removed it is kept as a 'log_deleted' entry.
 */
export async function logDelete(req, res) {
  const row = await deleteLog(req.params.id, { hideSystem: hideSystem(req) });
  if (!row) throw HttpError.notFound('This activity entry was not found.');
  if (row === 'protected') throw HttpError.forbidden('Delete records cannot be deleted.');
  await logCcare({
    ccareUserId: row.ccareUserId,
    name: row.name,
    action: 'log_deleted',
    success: true,
    actor: req.me.username,
    ip: ipOf(req),
    detail: {
      deletedBy: req.me.username,
      deletedId: Number(row.id),
      deletedAction: row.action,
      deletedAt: row.at,
      deletedActor: row.actor,
      deletedSuccess: row.success,
      deletedDetail: row.detail,
    },
  });
  res.json({ ok: true });
}

/** DELETE /ccare/logs — bulk clear by filter, or everything (manager only). */
export async function logsClear(req, res) {
  const { action, userId, before } = req.validatedQuery ?? {};
  const removed = await clearLogs({ action, userId, before });
  await logCcare({
    name: req.me.username,
    action: 'logs_cleared',
    success: true,
    actor: req.me.username,
    ip: ipOf(req),
    detail: {
      deletedBy: req.me.username,
      removed,
      action: action ?? null,
      userId: userId ?? null,
      before: before ?? null,
    },
  });
  res.json({ ok: true, removed });
}

/** GET /ccare/log-actions — distinct action names for the filter. */
export async function logActions(req, res) {
  res.json(await listActions({ hideSystem: hideSystem(req) }));
}

/** GET /ccare/logs/summary — headline counts for the activity page. */
export async function logSummary(req, res) {
  res.json(await summary({ hideSystem: hideSystem(req) }));
}
