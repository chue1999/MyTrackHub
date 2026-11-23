import { Op, QueryTypes } from 'sequelize';
import { isMssql, sequelize } from '../db/index.js';
import { AppUser } from '../models/index.js';
import { HttpError } from '../utils/http-error.js';
import { isUuid, likePattern, period, phoneDigits } from '../utils/query.js';
import { countIf, isFalse, jsonLength, limit, top } from '../utils/sql.js';

/** People using the mobile app (the "Users" pages). */

// Case-insensitive LIKE: ILIKE on PostgreSQL; SQL Server's collation already ignores case.
const LIKE = isMssql ? Op.like : Op.iLike;

const SORTS = Object.freeze({
  lastSeenAt: [['lastSeenAt', 'DESC']],
  loginCount: [['loginCount', 'DESC']],
  firstSeenAt: [['firstSeenAt', 'DESC']],
  // Lowest data first; users without a snapshot last.
  dataRemainMb: [
    [sequelize.literal('CASE WHEN "AppUser"."data_remain_mb" IS NULL THEN 1 ELSE 0 END'), 'ASC'],
    ['dataRemainMb', 'ASC'],
  ],
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
      { firstName: { [LIKE]: likePattern(search) } },
      { lastName: { [LIKE]: likePattern(search) } },
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
    order: SORTS[query.sort] ?? SORTS.lastSeenAt,
    limit: pageSize,
    offset,
    attributes: {
      exclude: ['activePackages'],
      include: [
        [
          sequelize.literal(`(SELECT CAST(COUNT(*) AS int) FROM events e WHERE e.user_id = "AppUser"."id"${inRange})`),
          'actionCount',
        ],
        [
          sequelize.literal(
            `(SELECT CAST(COUNT(*) AS int) FROM events e WHERE e.user_id = "AppUser"."id" AND ${isFalse('e.success')}${inRange})`,
          ),
          'failedCount',
        ],
        [sequelize.literal(jsonLength('"AppUser"."active_packages"')), 'packageCount'],
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
      `SELECT CAST(COUNT(*) AS int) AS "totalEvents",
              ${countIf("type = 'screen_view'")} AS "screenViews",
              ${countIf("type = 'tap'")} AS "taps",
              ${countIf(isFalse('success'))} AS "failed",
              CAST(COUNT(DISTINCT session_id) AS int) AS "sessions"
         FROM events WHERE user_id = :id`,
      { replacements, type: QueryTypes.SELECT },
    ),
    sequelize.query(
      `SELECT ${top(5)} name AS "name", CAST(COUNT(*) AS int) AS "count" FROM events
        WHERE user_id = :id AND type = 'screen_view'
        GROUP BY name ORDER BY "count" DESC ${limit(5)}`,
      { replacements, type: QueryTypes.SELECT },
    ),
    sequelize.query(
      `SELECT ${top(10)} device_id AS "deviceId", device_model AS "deviceModel", platform AS "platform",
              MAX(occurred_at) AS "lastUsedAt"
         FROM events WHERE user_id = :id AND device_id IS NOT NULL
        GROUP BY device_id, device_model, platform
        ORDER BY "lastUsedAt" DESC ${limit(10)}`,
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
