import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { isMssql, sequelize } from '../db/index.js';
import { CcareAccountDev } from '../models/ccare-account-dev.model.js';
import { HttpError } from '../utils/http-error.js';

/**
 * CCare staff accounts, kept in the pre-existing SQL Server table `Tb_User_detail`
 * (the same login as the "My CCare" web). Passwords there are plain md5(password).
 *
 * Raw SQL on purpose: this is an external table we must not let Sequelize's sync
 * create, alter or drop, so it is never defined as a model. Only SQL Server (prod)
 * has it; in development (PostgreSQL) a local stand-in table (CcareAccountDev)
 * backs the same operations so the whole CCare flow can be tested in dev.
 */
// CCare is available in production (SQL Server) and, via the dev stand-in table,
// in development (PostgreSQL) too.
export const ccareEnabled = true;
// When false we are on PostgreSQL (dev) and use the CcareAccountDev model.
const useDev = !isMssql;
// True when CCare is backed by the local dev table (PostgreSQL). The sign-in
// flow uses this to stay fully local (skip the My CCare proxy) so accounts
// created here log in with their own md5 password + a local OTP.
export const ccareDev = useDev;
const TABLE = '[Tb_User_detail]';

const md5 = (text) => crypto.createHash('md5').update(String(text), 'utf8').digest('hex');

/** A real, usable password is a 32-hex md5. Closed accounts store text like "Terminate202411". */
const isHashed = (pw) => typeof pw === 'string' && /^[a-f0-9]{32}$/i.test(pw.trim());

/** ANB 99 marks a terminated account (56 = active). */
const isActive = (row) => isHashed(row.Password) && row.ANB !== 99;

/** CCare row → safe shape for the website (never the password). */
function toPublic(row) {
  return {
    id: row.ID,
    name: row.Name,
    nameLa: row.Name_la,
    descrip: row.Descrip,
    status: row.Status,
    anb: row.ANB,
    brandId: row.BrandID,
    division: row.Division,
    position: row.POSITION,
    staffId: row.Staffid,
    staffTel: row.stafftel,
    roleCrm: row.role_CRM,
    cdate: row.cdate,
    // When the password was last set (for the 30-day expiry).
    passwordChangedAt: row.TimeResetPassWord ?? row.cdate ?? null,
    active: isActive(row),
    canManage: isActive(row) && (row.Descrip || '').toLowerCase() === 'admin',
  };
}

function ensureEnabled() {
  if (!ccareEnabled) {
    throw HttpError.badRequest('CCare accounts live in SQL Server (production). This server uses PostgreSQL.');
  }
}

async function one(sql, replacements) {
  const [rows] = await sequelize.query(sql, { replacements });
  return rows[0] ?? null;
}

/** Find an account by its exact login name (used by the login flow). */
async function rowByName(name) {
  if (useDev) return CcareAccountDev.findOne({ where: { Name: name }, raw: true });
  return one(`SELECT TOP (1) * FROM ${TABLE} WHERE Name = :name`, { name });
}
async function rowById(id) {
  if (useDev) return CcareAccountDev.findOne({ where: { ID: Number(id) }, raw: true });
  return one(`SELECT TOP (1) * FROM ${TABLE} WHERE ID = :id`, { id });
}

/**
 * Checks CCare credentials. Returns the public account (with its md5-verified
 * identity) or null when the name/password is wrong. Throws 403 when the
 * account exists but is closed, so the person gets a clear message.
 */
export async function verifyLogin(name, password) {
  return (await checkLogin(name, password)).user;
}

/**
 * Like verifyLogin, but also says why it failed (for the audit log; never the
 * password): 'unknown_user' | 'no_password' | 'wrong_password'.
 * The stored md5 is trimmed: Tb_User_detail.Password may be a fixed-length
 * CHAR column padded with spaces (SQL Server ignores them, JavaScript does not).
 */
export async function checkLogin(name, password) {
  if (!ccareEnabled) return { user: null, reason: 'disabled' };
  const row = await rowByName(name);
  if (!row) return { user: null, reason: 'unknown_user' };
  const stored = String(row.Password ?? '').trim().toLowerCase();
  if (!isHashed(stored)) return { user: null, reason: 'no_password' };
  if (stored !== md5(password)) return { user: null, reason: 'wrong_password' };
  if (!isActive(row))
    throw new HttpError(403, 'This CCare account is closed. Ask an administrator.', 'ACCOUNT_DISABLED');
  return { user: toPublic(row), reason: null };
}

/** Look up an account by login name (used by the forgot-password flow). */
export async function getByName(name) {
  if (!ccareEnabled) return null;
  const row = await rowByName(name);
  return row ? toPublic(row) : null;
}

/** The account behind a CCare login token (re-read on every request). */
export async function getActiveById(id) {
  if (!ccareEnabled) return null;
  const row = await rowById(id);
  if (!row || !isActive(row)) return null;
  return toPublic(row);
}

/** Dev (PostgreSQL) list over the local CcareAccountDev stand-in table. */
async function listDev({ search = '', page = 1, pageSize = 50 }) {
  const where = search
    ? {
        [Op.or]: ['Name', 'Name_la', 'Staffid', 'Division', 'POSITION'].map((f) => ({
          [f]: { [Op.iLike]: `%${search}%` },
        })),
      }
    : {};
  const size = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
  const current = Math.max(Number(page) || 1, 1);
  const { rows, count } = await CcareAccountDev.findAndCountAll({
    where,
    order: [['ID', 'DESC']],
    limit: size,
    offset: (current - 1) * size,
    raw: true,
  });
  const all = await CcareAccountDev.findAll({ where, raw: true });
  const active = all.filter(isActive).length;
  const managers = all.filter((r) => isActive(r) && (r.Descrip || '').toLowerCase() === 'admin').length;
  return {
    rows: rows.map(toPublic),
    total: count,
    page: current,
    pageSize: size,
    counts: { total: count, active, managers, closed: count - active },
  };
}

/** List accounts for the CCare page, newest first, optional name/staff search. */
export async function list({ search = '', page = 1, pageSize = 50 } = {}) {
  ensureEnabled();
  if (useDev) return listDev({ search, page, pageSize });
  const where = search
    ? `WHERE Name LIKE :like OR Name_la LIKE :like OR Staffid LIKE :like OR Division LIKE :like OR [POSITION] LIKE :like`
    : '';
  const replacements = search ? { like: `%${search.replace(/[%_[]/g, (c) => `[${c}]`)}%` } : {};

  // Headline counts (whole filtered set) for the stat tiles, so they stay
  // correct no matter which page is shown. An account is active when its
  // password is a 32-char hash and ANB is not 99 (closed).
  const [[counts]] = await sequelize.query(
    `SELECT
       CAST(COUNT(*) AS int) AS total,
       CAST(SUM(CASE WHEN LEN(Password) = 32 AND (ANB IS NULL OR ANB <> 99) THEN 1 ELSE 0 END) AS int) AS active,
       CAST(SUM(CASE WHEN LEN(Password) = 32 AND (ANB IS NULL OR ANB <> 99) AND LOWER(Descrip) = 'admin' THEN 1 ELSE 0 END) AS int) AS managers
     FROM ${TABLE} ${where}`,
    { replacements },
  );

  const size = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
  const current = Math.max(Number(page) || 1, 1);
  const offset = (current - 1) * size;
  const [rows] = await sequelize.query(
    `SELECT * FROM ${TABLE} ${where} ORDER BY ID DESC OFFSET ${offset} ROWS FETCH NEXT ${size} ROWS ONLY`,
    { replacements },
  );
  return {
    rows: rows.map(toPublic),
    total: counts.total,
    page: current,
    pageSize: size,
    counts: {
      total: counts.total,
      active: counts.active,
      managers: counts.managers,
      closed: counts.total - counts.active,
    },
  };
}

export async function getById(id) {
  ensureEnabled();
  const row = await rowById(id);
  if (!row) throw HttpError.notFound('Account not found');
  return toPublic(row);
}

const clean = (v) => (v === undefined || v === null || v === '' ? null : v);

/** SQL Server rejects a value longer than its column: say which, instead of a 500. */
function tooLong(err) {
  const msg = err?.original?.message || err?.parent?.message || err?.message || '';
  if (!/truncated/i.test(msg)) return err;
  const col = msg.match(/column '([^']+)'/i)?.[1];
  return HttpError.badRequest(
    `${col ? `"${col}"` : 'A value'} is too long for the CCare database column. Shorten it, or ask the DBA to widen the column.`,
  );
}

/**
 * Create an account. ID is assigned here because the table has no identity.
 * `descrip` is 'user' unless an administrator creates an 'Admin'.
 */
export async function create(data) {
  ensureEnabled();
  const name = String(data.name || '').trim();
  if (!name) throw HttpError.badRequest('Enter a username');
  if (!data.password) throw HttpError.badRequest('A password is required');
  if (await rowByName(name)) throw HttpError.conflict(`The name "${name}" is already taken`);

  if (useDev) {
    const row = await CcareAccountDev.create({
      Name: name,
      Password: md5(data.password),
      Descrip: data.descrip === 'Admin' ? 'Admin' : 'user',
      Status: data.descrip === 'Admin' ? '3' : '2',
      Name_la: clean(data.nameLa),
      ANB: 56,
      TimeResetPassWord: new Date(),
      BrandID: clean(data.brandId) ?? '',
      Division: clean(data.division) ?? '',
      POSITION: clean(data.position) ?? '',
      Staffid: clean(data.staffId),
      stafftel: clean(data.staffTel),
      role_CRM: clean(data.roleCrm),
    });
    return getById(row.ID);
  }

  // Assign the ID and insert in one transaction (the table has no identity); then
  // read the row back on the normal connection, after the row is committed.
  const id = await sequelize
    .transaction(async (transaction) => {
      const [[next]] = await sequelize.query(`SELECT ISNULL(MAX(ID), 0) + 1 AS id FROM ${TABLE} WITH (TABLOCKX)`, {
        transaction,
      });
      await sequelize.query(
        `INSERT INTO ${TABLE}
         (ID, Name, Password, Descrip, Status, cdate, TimeResetPassWord, Name_la, ANB, BrandID, Division, [POSITION], Staffid, stafftel, role_CRM)
       VALUES
         (:id, :name, :password, :descrip, :status, SYSDATETIME(), SYSDATETIME(), :nameLa, :anb, :brandId, :division, :position, :staffId, :staffTel, :roleCrm)`,
        {
          transaction,
          replacements: {
            id: next.id,
            name,
            password: md5(data.password),
            descrip: data.descrip === 'Admin' ? 'Admin' : 'user',
            status: data.descrip === 'Admin' ? '3' : '2',
            nameLa: clean(data.nameLa),
            anb: 56,
            brandId: clean(data.brandId) ?? '',
            division: clean(data.division) ?? '',
            position: clean(data.position) ?? '',
            staffId: clean(data.staffId),
            staffTel: clean(data.staffTel),
            roleCrm: clean(data.roleCrm),
          },
        },
      );
      return next.id;
    })
    .catch((err) => {
      throw tooLong(err);
    });
  return getById(id);
}

/** Edit the profile fields (not the password — see resetPassword). */
export async function update(id, data) {
  ensureEnabled();
  if (!(await rowById(id))) throw HttpError.notFound('Account not found');
  if (useDev) {
    const patch = {};
    if (data.nameLa !== undefined) patch.Name_la = clean(data.nameLa);
    if (data.division !== undefined) patch.Division = clean(data.division) ?? '';
    if (data.position !== undefined) patch.POSITION = clean(data.position) ?? '';
    if (data.staffId !== undefined) patch.Staffid = clean(data.staffId);
    if (data.staffTel !== undefined) patch.stafftel = clean(data.staffTel);
    if (data.brandId !== undefined) patch.BrandID = clean(data.brandId) ?? '';
    if (data.descrip !== undefined) patch.Descrip = data.descrip === 'Admin' ? 'Admin' : 'user';
    if (Object.keys(patch).length) await CcareAccountDev.update(patch, { where: { ID: Number(id) } });
    return getById(id);
  }
  const set = [];
  const replacements = { id };
  const field = (col, key, value) => {
    set.push(`${col} = :${key}`);
    replacements[key] = value;
  };
  if (data.nameLa !== undefined) field('Name_la', 'nameLa', clean(data.nameLa));
  if (data.division !== undefined) field('Division', 'division', clean(data.division) ?? '');
  if (data.position !== undefined) field('[POSITION]', 'position', clean(data.position) ?? '');
  if (data.staffId !== undefined) field('Staffid', 'staffId', clean(data.staffId));
  if (data.staffTel !== undefined) field('stafftel', 'staffTel', clean(data.staffTel));
  if (data.brandId !== undefined) field('BrandID', 'brandId', clean(data.brandId) ?? '');
  if (data.descrip !== undefined) field('Descrip', 'descrip', data.descrip === 'Admin' ? 'Admin' : 'user');
  if (!set.length) return getById(id);
  await sequelize.query(`UPDATE ${TABLE} SET ${set.join(', ')} WHERE ID = :id`, { replacements }).catch((err) => {
    throw tooLong(err);
  });
  return getById(id);
}

/** Set a new password (stored as md5) and clear a terminated state. */
export async function resetPassword(id, newPassword) {
  ensureEnabled();
  if (!newPassword) throw HttpError.badRequest('A password is required');
  if (!(await rowById(id))) throw HttpError.notFound('Account not found');
  if (useDev) {
    await CcareAccountDev.update(
      { Password: md5(newPassword), ANB: 56, TimeResetPassWord: new Date() },
      { where: { ID: Number(id) } },
    );
    return getById(id);
  }
  await sequelize.query(
    `UPDATE ${TABLE} SET Password = :pw, ANB = 56, TimeResetPassWord = SYSDATETIME() WHERE ID = :id`,
    { replacements: { pw: md5(newPassword), id } },
  );
  return getById(id);
}

/** Close an account (ANB 99) or reopen it (ANB 56), without deleting the row. */
export async function setActive(id, active) {
  ensureEnabled();
  if (!(await rowById(id))) throw HttpError.notFound('Account not found');
  if (useDev) {
    await CcareAccountDev.update({ ANB: active ? 56 : 99 }, { where: { ID: Number(id) } });
    return getById(id);
  }
  await sequelize.query(`UPDATE ${TABLE} SET ANB = :anb WHERE ID = :id`, {
    replacements: { anb: active ? 56 : 99, id },
  });
  return getById(id);
}
