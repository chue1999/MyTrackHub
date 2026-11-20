import * as accountService from '../services/account.service.js';

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

/** DELETE /accounts/:id */
export async function remove(req, res) {
  await accountService.deleteAccount(req.params.id, req.me.id);
  res.status(204).end();
}
