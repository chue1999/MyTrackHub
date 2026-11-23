import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../db/index.js';
import { AppUser } from '../models/index.js';
import { HttpError } from '../utils/http-error.js';
import { isUuid, likePattern, period, phoneDigits } from '../utils/query.js';

/** People using the mobile app (the "Users" pages). */

const SORTS = Object.freeze({
  lastSeenAt: ['lastSeenAt', 'DESC'],
  loginCount: ['loginCount', 'DESC'],
  firstSeenAt: ['firstSeenAt', 'DESC'],
  dataRemainMb: ['dataRemainMb', 'ASC NULLS LAST'],
});

/**
 * Search users by name or phone. With from/to, only users active in that
 * period are returned and their counts cover only that period.
 */
export async function listUsers(query, { page, pageSize, offset }) {
  const where = {};
  const search = String(query.search || '').trim();
  if (search) {
    const digits = phoneDigits(search);
    where[Op.or] = [
      { firstName: { [Op.iLike]: likePattern(search) } },
      { lastName: { [Op.iLike]: likePattern(search) } },
      ...(digits ? [{ msisdn: { [Op.like]: likePattern(digits) } }] : []),
    ];
  }

  const hasRange = Boolean(query.from || query.to);
  const { since, until } = period(query, 3650);
  const inRange = hasRange
    ? ` AND e.occurred_at BETWEEN ${sequelize.escape(since.toISOString())} AND ${sequelize.escape(until.toISOString())}`
    : '';
  if (hasRange) {
    where[Op.and] = [sequelize.literal(`EXISTS (SELECT 1 FROM events e WHERE e.user_id = "AppUser"."id"${inRange})`)];
  }

  const { rows, count } = await AppUser.findAndCountAll({
    where,
    order: [SORTS[query.sort] ?? SORTS.lastSeenAt],
    limit: pageSize,
    offset,
    attributes: {
      exclude: ['activePackages'],
      include: [
        [
          sequelize.literal(`(SELECT COUNT(*)::int FROM events e WHERE e.user_id = "AppUser"."id"${inRange})`),
          'actionCount',
        ],
        [
          sequelize.literal(
            `(SELECT COUNT(*)::int FROM events e WHERE e.user_id = "AppUser"."id" AND e.success IS FALSE${inRange})`,
          ),
          'failedCount',
        ],
        [sequelize.literal(`COALESCE(jsonb_array_length("AppUser"."active_packages"), 0)`), 'packageCount'],
      ],
    },
  });
  return { items: rows, total: count, page, pageSize };
}

async function findUser(id) {
  const user = isUuid(id) ? await AppUser.findByPk(id) : null;
  if (!user) throw HttpError.notFound('User not found');
  return user;
}

/** One user's profile plus a summary of what they use most. */
export async function getUserDetail(id) {
  const user = await findUser(id);
  const replacements = { id: user.id };
  const [[summary], topScreens, devices] = await Promise.all([
    sequelize.query(
      `SELECT COUNT(*)::int AS "totalEvents",
              COUNT(*) FILTER (WHERE type = 'screen_view')::int AS "screenViews",
              COUNT(*) FILTER (WHERE type = 'tap')::int AS taps,
              COUNT(*) FILTER (WHERE success IS FALSE)::int AS failed,
              COUNT(DISTINCT session_id)::int AS sessions
         FROM events WHERE user_id = :id`,
      { replacements, type: QueryTypes.SELECT },
    ),
    sequelize.query(
      `SELECT name, COUNT(*)::int AS count FROM events
        WHERE user_id = :id AND type = 'screen_view'
        GROUP BY name ORDER BY count DESC LIMIT 5`,
      { replacements, type: QueryTypes.SELECT },
    ),
    sequelize.query(
      `SELECT device_id AS "deviceId", device_model AS "deviceModel", platform, MAX(occurred_at) AS "lastUsedAt"
         FROM events WHERE user_id = :id AND device_id IS NOT NULL
        GROUP BY device_id, device_model, platform
        ORDER BY "lastUsedAt" DESC LIMIT 10`,
      { replacements, type: QueryTypes.SELECT },
    ),
  ]);
  return { user, summary, topScreens, devices };
}

/** Staff can correct the name or keep a note. */
export async function updateUser(id, changes) {
  const user = await findUser(id);
  await user.update(changes);
  return user;
}
