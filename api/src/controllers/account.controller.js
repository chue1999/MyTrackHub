import * as accountService from '../services/account.service.js';
import { ipOf, logCcare } from '../services/ccare-log.service.js';

/** GET /accounts */
export async function list(_req, res) {
  res.json(await accountService.listAccounts());
}

/** POST /accounts */
export async function create(req, res) {
  res.status(201).json(await accountService.createAccount(req.body));
}

/** PATCH /accounts/:id */
export async function update(req, res) {
  res.json(await accountService.updateAccount(req.params.id, req.body));
}

/** DELETE /accounts/:id — the delete is recorded (who removed which account). */
export async function remove(req, res) {
  const removed = await accountService.deleteAccount(req.params.id, req.me.id);
  await logCcare({
    name: removed.username,
    action: 'admin_account_delete',
    success: true,
    actor: req.me.username,
    ip: ipOf(req),
    detail: { deletedBy: req.me.username, ...removed },
  });
  res.status(204).end();
}
