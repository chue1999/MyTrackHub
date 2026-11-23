import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../db/index.js';
import { AppUser, Event } from '../models/index.js';
import { isUuid, period, startOfToday } from '../utils/query.js';

/**
 * Read-only statistics for the Dashboard, Packages and App features pages.
 * Heavy lifting is done in SQL (PostgreSQL) so the API stays fast.
 */

/** Dashboard: headline numbers, daily chart, top screens/taps/APIs, transfers, failures. */
export async function getOverview(query) {
  const { since, until } = period(query, 14);
  const today = startOfToday();

  const [totalUsers, newUsersToday, eventsToday, loginsToday, activeToday, failedToday] = await Promise.all([
    AppUser.count(),
    AppUser.count({ where: { firstSeenAt: { [Op.gte]: today } } }),
    Event.count({ where: { occurredAt: { [Op.gte]: today } } }),
    Event.count({ where: { type: 'login', occurredAt: { [Op.gte]: today } } }),
    Event.count({
      where: { occurredAt: { [Op.gte]: today }, userId: { [Op.ne]: null } },
      distinct: true,
      col: 'user_id',
    }),
    Event.count({ where: { success: false, occurredAt: { [Op.gte]: today } } }),
  ]);

  const daily = await sequelize.query(
    `SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
                COALESCE(COUNT(DISTINCT e.user_id), 0)::int AS "activeUsers",
                COALESCE(COUNT(e.id), 0)::int AS events,
                COALESCE(COUNT(e.id) FILTER (WHERE e.type = 'login'), 0)::int AS logins
           FROM generate_series(:since::date, :until::date, interval '1 day') AS d(day)
           LEFT JOIN events e ON e.occurred_at >= d.day AND e.occurred_at < d.day + interval '1 day'
          GROUP BY d.day
          ORDER BY d.day`,
    { replacements: { since, until }, type: QueryTypes.SELECT },
  );

  const top = (type) =>
    sequelize.query(
      `SELECT name, COUNT(*)::int AS count, COUNT(DISTINCT user_id)::int AS users
             FROM events
            WHERE type = :type AND occurred_at BETWEEN :since AND :until
            GROUP BY name
            ORDER BY count DESC
            LIMIT 10`,
      { replacements: { type, since, until }, type: QueryTypes.SELECT },
    );
  const [topScreens, topTaps] = await Promise.all([top('screen_view'), top('tap')]);
  const topApis = await sequelize.query(
    `SELECT name, COUNT(*)::int AS count, COUNT(DISTINCT user_id)::int AS users,
                ROUND(AVG((properties->>'ms')::numeric))::int AS "avgMs",
                COUNT(*) FILTER (WHERE success IS TRUE)::int AS succeeded,
                COUNT(*) FILTER (WHERE success IS FALSE)::int AS failed
           FROM events
          WHERE type = 'api' AND occurred_at BETWEEN :since AND :until
          GROUP BY name
          ORDER BY count DESC
          LIMIT 10`,
    { replacements: { since, until }, type: QueryTypes.SELECT },
  );

  // What users do, by type (pie chart).
  const byType = await sequelize.query(
    `SELECT type, COUNT(*)::int AS count FROM events
          WHERE occurred_at BETWEEN :since AND :until GROUP BY type ORDER BY count DESC`,
    { replacements: { since, until }, type: QueryTypes.SELECT },
  );

  // API results (pie chart).
  const [apiResults] = await sequelize.query(
    `SELECT COUNT(*) FILTER (WHERE success IS TRUE)::int AS success,
                COUNT(*) FILTER (WHERE success IS FALSE)::int AS failed,
                COUNT(*) FILTER (WHERE success IS NULL)::int AS unknown
           FROM events WHERE type = 'api' AND occurred_at BETWEEN :since AND :until`,
    { replacements: { since, until }, type: QueryTypes.SELECT },
  );

  // Money transfers: receiver and amount come from the recorded request.
  const amountSql = `NULLIF(regexp_replace(e.properties->'request'->'body'->>'TransferAmount', '[^0-9.]', '', 'g'), '')::numeric`;
  const [transfersToday] = await sequelize.query(
    `SELECT COUNT(*)::int AS count,
                COUNT(*) FILTER (WHERE e.success IS TRUE)::int AS succeeded,
                COUNT(*) FILTER (WHERE e.success IS FALSE)::int AS failed,
                COALESCE(SUM(${amountSql}) FILTER (WHERE e.success IS TRUE), 0)::float AS amount
           FROM events e
          WHERE e.type = 'api' AND e.name LIKE '%/TransferBalance' AND e.occurred_at >= :today`,
    { replacements: { today }, type: QueryTypes.SELECT },
  );
  const recentTransfers = await sequelize.query(
    `SELECT e.id::text AS id, e.occurred_at AS "occurredAt", e.success, e.result,
                e.properties->'request'->'body'->>'Receiver' AS receiver,
                ${amountSql}::float AS amount,
                u.id AS "userId", u.msisdn, u.first_name AS "firstName", u.last_name AS "lastName"
           FROM events e LEFT JOIN app_users u ON u.id = e.user_id
          WHERE e.type = 'api' AND e.name LIKE '%/TransferBalance' AND e.occurred_at BETWEEN :since AND :until
          ORDER BY e.occurred_at DESC
          LIMIT 10`,
    { replacements: { since, until }, type: QueryTypes.SELECT },
  );

  // Two kinds of logout: full (back to phone number) vs locked (back to password).
  const [logouts] = await sequelize.query(
    `SELECT COUNT(*) FILTER (WHERE name IN ('logout', 'logout_full'))::int AS full,
                COUNT(*) FILTER (WHERE name = 'logout_to_password')::int AS "toPassword",
                COUNT(*) FILTER (WHERE name IN ('logout', 'logout_full') AND occurred_at >= :today)::int AS "fullToday",
                COUNT(*) FILTER (WHERE name = 'logout_to_password' AND occurred_at >= :today)::int AS "toPasswordToday"
           FROM events WHERE type = 'logout' AND occurred_at BETWEEN :since AND :until`,
    { replacements: { since, until, today }, type: QueryTypes.SELECT },
  );

  // API calls in the last 15 minutes from an app still running the old
  // recorder (no request/response/result captured).
  const outdatedRecent = await Event.count({
    where: {
      type: 'api',
      success: null,
      occurredAt: { [Op.gte]: new Date(Date.now() - 15 * 60_000) },
      [Op.and]: sequelize.literal(`properties ? 'ok'`),
    },
  });

  // Today's most recent failures (the "Needs attention" card).
  const recentFailures = await Event.findAll({
    where: { success: false, occurredAt: { [Op.gte]: today } },
    order: [
      ['occurredAt', 'DESC'],
      ['id', 'DESC'],
    ],
    limit: 6,
    include: [{ model: AppUser, as: 'user', attributes: ['id', 'msisdn', 'firstName', 'lastName'] }],
  });

  return {
    totals: { totalUsers, newUsersToday, activeToday, eventsToday, loginsToday, failedToday },
    outdatedRecent,
    recentFailures,
    logouts,
    byType,
    apiResults,
    transfersToday,
    recentTransfers,
    daily,
    topScreens,
    topTaps,
    topApis,
  };
}

/**
 * Packages: purchases come from the app's RegisterPackage* API calls (price
 * attached by the app); data balance comes from each user's latest
 * active-packages snapshot.
 */
export async function getPackageStats(query) {
  const { since, until, days } = period(query, 30);
  const today = startOfToday();

  // One row per purchase attempt, with the useful fields pulled out.
  const base = `
    WITH p AS (
      SELECT e.id, e.occurred_at, e.success, e.result, e.user_id,
             COALESCE(e.properties->'purchase'->>'channel',
               CASE WHEN e.name LIKE '%SpinerWheel%' THEN 'lucky_wheel'
                    WHEN e.name LIKE '%MMonney%' THEN 'mmoney'
                    WHEN e.name LIKE '%PackageIR%' THEN 'roaming'
                    ELSE 'balance' END) AS channel,
             COALESCE(e.properties->'purchase'->>'code',
                      e.properties->'request'->'body'->>'PackageCode',
                      e.properties->'request'->'body'->>'pkCode') AS code,
             e.properties->'purchase'->>'name' AS name,
             e.properties->'purchase'->>'net' AS net,
             e.properties->'purchase'->>'duration' AS duration,
             e.properties->'purchase'->>'forWhom' AS for_whom,
             e.properties->'purchase'->>'forNumber' AS for_number,
             NULLIF(regexp_replace(COALESCE(e.properties->'purchase'->>'price', ''), '[^0-9.]', '', 'g'), '')::numeric AS price
        FROM events e
       WHERE e.type = 'api' AND e.name LIKE '%RegisterPackage%' AND e.occurred_at BETWEEN :since AND :until
    )`;
  const q = (sql, extra = {}) =>
    sequelize.query(`${base} ${sql}`, { replacements: { since, until, today, ...extra }, type: QueryTypes.SELECT });

  const [[totals], [todayTotals], byChannel, topPackages, daily, recent] = await Promise.all([
    q(`SELECT COUNT(*) FILTER (WHERE success IS TRUE)::int AS sold,
              COUNT(*) FILTER (WHERE success IS FALSE)::int AS failed,
              COUNT(*) FILTER (WHERE success IS NULL)::int AS unknown,
              COALESCE(SUM(price) FILTER (WHERE success IS TRUE), 0)::float AS revenue,
              COUNT(*) FILTER (WHERE success IS TRUE AND price IS NULL)::int AS "soldNoPrice",
              COUNT(DISTINCT user_id) FILTER (WHERE success IS TRUE)::int AS buyers
         FROM p`),
    q(`SELECT COUNT(*) FILTER (WHERE success IS TRUE)::int AS sold,
              COALESCE(SUM(price) FILTER (WHERE success IS TRUE), 0)::float AS revenue
         FROM p WHERE occurred_at >= :today`),
    q(`SELECT channel, COUNT(*) FILTER (WHERE success IS TRUE)::int AS sold,
              COALESCE(SUM(price) FILTER (WHERE success IS TRUE), 0)::float AS revenue
         FROM p GROUP BY channel ORDER BY sold DESC`),
    q(`SELECT code, MAX(name) AS name, MAX(net) AS net, MAX(duration) AS duration,
              MAX(price)::float AS price,
              COUNT(*) FILTER (WHERE success IS TRUE)::int AS sold,
              COUNT(*) FILTER (WHERE success IS FALSE)::int AS failed,
              COALESCE(SUM(price) FILTER (WHERE success IS TRUE), 0)::float AS revenue
         FROM p WHERE code IS NOT NULL
        GROUP BY code ORDER BY revenue DESC, sold DESC LIMIT 10`),
    sequelize.query(
      `${base}
       SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
              COUNT(p.id) FILTER (WHERE p.success IS TRUE)::int AS sold,
              COALESCE(SUM(p.price) FILTER (WHERE p.success IS TRUE), 0)::float AS revenue
         FROM generate_series(:since::date, :until::date, interval '1 day') AS d(day)
         LEFT JOIN p ON p.occurred_at >= d.day AND p.occurred_at < d.day + interval '1 day'
        GROUP BY d.day ORDER BY d.day`,
      { replacements: { since, until }, type: QueryTypes.SELECT },
    ),
    q(`SELECT p.id::text AS id, p.occurred_at AS "occurredAt", p.success, p.result, p.channel, p.code,
              p.name, p.net, p.duration, p.price::float AS price, p.for_whom AS "forWhom", p.for_number AS "forNumber",
              u.id AS "userId", u.msisdn, u.first_name AS "firstName", u.last_name AS "lastName"
         FROM p LEFT JOIN app_users u ON u.id = p.user_id
        ORDER BY p.occurred_at DESC LIMIT 15`),
  ]);

  // Data balance from each user's latest snapshot.
  const [data] = await sequelize.query(
    `SELECT COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(active_packages, '[]'::jsonb)) > 0)::int AS "usersWithPackages",
            COALESCE(SUM(jsonb_array_length(COALESCE(active_packages, '[]'::jsonb))), 0)::int AS "activePackages",
            COALESCE(SUM(data_remain_mb), 0)::float AS "remainMb",
            COALESCE(SUM(data_used_mb), 0)::float AS "usedMb"
       FROM app_users WHERE packages_updated_at IS NOT NULL`,
    { type: QueryTypes.SELECT },
  );
  const inUse = await sequelize.query(
    `SELECT pkg->>'name' AS name, COUNT(*)::int AS users,
            COALESCE(SUM(NULLIF(pkg->>'remainMb', '')::numeric), 0)::float AS "remainMb",
            COALESCE(SUM(NULLIF(pkg->>'usedMb', '')::numeric), 0)::float AS "usedMb"
       FROM app_users, jsonb_array_elements(COALESCE(active_packages, '[]'::jsonb)) AS pkg
      GROUP BY pkg->>'name' ORDER BY users DESC LIMIT 10`,
    { type: QueryTypes.SELECT },
  );
  const lowData = await sequelize.query(
    `SELECT id, msisdn, first_name AS "firstName", last_name AS "lastName",
            data_remain_mb AS "remainMb", data_used_mb AS "usedMb", packages_updated_at AS "updatedAt",
            jsonb_array_length(COALESCE(active_packages, '[]'::jsonb))::int AS packages
       FROM app_users
      WHERE packages_updated_at IS NOT NULL
      ORDER BY data_remain_mb ASC NULLS LAST LIMIT 10`,
    { type: QueryTypes.SELECT },
  );

  return { days, totals, today: todayTotals, byChannel, topPackages, daily, recent, data, inUse, lowData };
}

/**
 * App features: usage of every API the app called (uses, successes, failures,
 * users, last use). The website groups these into features.
 */
export async function getFeatureStats(query) {
  const { since, until, days } = period(query, 30);
  const userId = isUuid(query.userId) ? query.userId : null;
  const rows = await sequelize.query(
    `SELECT name,
            COUNT(*)::int AS uses,
            COUNT(*) FILTER (WHERE success IS TRUE)::int AS succeeded,
            COUNT(*) FILTER (WHERE success IS FALSE)::int AS failed,
            COUNT(DISTINCT user_id)::int AS users,
            MAX(occurred_at) AS "lastAt"
       FROM events
      WHERE type = 'api' AND occurred_at BETWEEN :since AND :until ${userId ? 'AND user_id = :userId' : ''}
      GROUP BY name`,
    { replacements: { since, until, userId }, type: QueryTypes.SELECT },
  );

  return { days, apis: rows };
}
