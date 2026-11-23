import { Op } from 'sequelize';
import { isMssql, sequelize } from '../db/index.js';
import { AppUser, Event, EVENT_TYPES } from '../models/index.js';
import { HttpError } from '../utils/http-error.js';
import { dateBounds, isUuid, likePattern, phoneDigits } from '../utils/query.js';

/** The activity log: one user's timeline or the global explorer. */

const USER_ATTRIBUTES = ['id', 'msisdn', 'firstName', 'lastName'];
const includeUser = [{ model: AppUser, as: 'user', attributes: USER_ATTRIBUTES }];

/** ?apis=TransferBalance,tplusqueue/add → those API names (one app feature). */
function parseApiNames(value) {
  return String(value || '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => /^[A-Za-z0-9_\-/]{1,80}$/.test(name))
    .slice(0, 40);
}

// Case-insensitive LIKE: ILIKE on PostgreSQL; SQL Server's collation already ignores case.
const LIKE = isMssql ? Op.like : Op.iLike;
// The JSON details as text (SQL Server already stores them as text).
const propertiesText = () =>
  isMssql ? sequelize.col('Event.properties') : sequelize.cast(sequelize.col('Event.properties'), 'text');

function searchConditions(search) {
  const digits = phoneDigits(search);
  const pattern = likePattern(search);
  return [
    { name: { [LIKE]: pattern } },
    { screen: { [LIKE]: pattern } },
    { result: { [LIKE]: pattern } },
    // The user's name: typing "Somsack" finds their actions too.
    { '$user.first_name$': { [LIKE]: pattern } },
    { '$user.last_name$': { [LIKE]: pattern } },
    ...(digits.length >= 3 ? [{ msisdn: { [Op.like]: likePattern(digits) } }] : []),
    // Also look inside request/response details (e.g. a transfer receiver).
    ...(digits.length >= 6 ? [sequelize.where(propertiesText(), { [Op.like]: likePattern(digits) })] : []),
  ];
}

/** Filters: userId, type, apis, success, from/to, search. */
export async function listEvents(query, { page, pageSize, offset }) {
  const where = {};
  const and = [];

  if (query.userId) {
    if (!isUuid(query.userId)) throw HttpError.badRequest('Invalid userId');
    where.userId = query.userId;
  }
  if (EVENT_TYPES.includes(query.type)) where.type = query.type;

  const apis = parseApiNames(query.apis);
  if (apis.length) {
    where.type = 'api';
    and.push({ [Op.or]: apis.map((api) => ({ name: { [Op.like]: `%/${api}` } })) });
  }

  if (query.success === 'true') where.success = true;
  if (query.success === 'false') where.success = false;

  const { from, to } = dateBounds(query);
  if (from || to) {
    where.occurredAt = { ...(from && { [Op.gte]: from }), ...(to && { [Op.lte]: to }) };
  }

  const search = String(query.search || '').trim();
  if (search) where[Op.or] = searchConditions(search);
  if (and.length) where[Op.and] = and;

  const { rows, count } = await Event.findAndCountAll({
    where,
    order: [
      ['occurredAt', 'DESC'],
      ['id', 'DESC'],
    ],
    limit: pageSize,
    offset,
    include: includeUser,
  });
  return { items: rows, total: count, page, pageSize };
}

/** One event, for the details page. */
export async function getEvent(id) {
  const event = /^\d{1,18}$/.test(String(id)) ? await Event.findByPk(id, { include: includeUser }) : null;
  if (!event) throw HttpError.notFound('Action not found');
  return event;
}
