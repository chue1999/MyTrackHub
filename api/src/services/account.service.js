import { Op } from 'sequelize';
import { Admin } from '../models/index.js';
import { HttpError } from '../utils/http-error.js';
import { hashPassword } from './auth.service.js';

/** Admin website accounts (the "Admin accounts" page). */

const LAST_ADMIN_MESSAGE = 'There must always be at least one active administrator';

export const listAccounts = () => Admin.findAll({ order: [['createdAt', 'ASC']] });

async function findAccount(id) {
  const account = await Admin.findByPk(id);
  if (!account) throw HttpError.notFound('Account not found');
  return account;
}

async function assertUsernameFree(username) {
  if (await Admin.findOne({ where: { username } })) throw HttpError.conflict('This username is already taken');
}

/** Number of other active administrators. */
const otherActiveAdmins = (exceptId) =>
  Admin.count({ where: { role: 'admin', isActive: true, id: { [Op.ne]: exceptId } } });

export async function createAccount({ password, ...data }) {
  await assertUsernameFree(data.username);
  const created = await Admin.create({ ...data, passwordHash: await hashPassword(password) });
  return Admin.findByPk(created.id);
}

export async function updateAccount(id, { password, ...data }) {
  const account = await findAccount(id);
  if (data.username && data.username !== account.username) await assertUsernameFree(data.username);

  const losesAdminRights =
    account.role === 'admin' && account.isActive && (data.role === 'viewer' || data.isActive === false);
  if (losesAdminRights && (await otherActiveAdmins(account.id)) === 0) throw HttpError.badRequest(LAST_ADMIN_MESSAGE);

  const changes = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  if (password) changes.passwordHash = await hashPassword(password);
  await account.update(changes);
  return Admin.findByPk(account.id);
}

export async function deleteAccount(id, currentAdminId) {
  const account = await findAccount(id);
  if (account.id === currentAdminId) throw HttpError.badRequest('You cannot delete your own account');
  if (account.role === 'admin' && account.isActive && (await otherActiveAdmins(account.id)) === 0) {
    throw HttpError.badRequest(LAST_ADMIN_MESSAGE);
  }
  const removed = { id: account.id, username: account.username, displayName: account.displayName, role: account.role };
  await account.destroy();
  return removed;
}
