import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../db/index.js';
import { AppUser, Event } from '../models/index.js';
import { isUuid, period, startOfToday } from '../utils/query.js';
import {
  countIf,
  DAYS,
  dayBuckets,
  hasKey,
  isFalse,
  isTrue,
  json,
  jsonLength,
  jsonRows,
  lateral,
  limit,
  money,
  sumIf,
  toNumber,
  top,
} from '../utils/sql.js';

/**
 * Read-only statistics for the Dashboard, Packages and App features pages.
 * Heavy lifting is done in SQL (PostgreSQL in dev, SQL Server in prod; see utils/sql.js).
 */

const select = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });

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

  const daily = await select(
    `SELECT d.date AS "date",
            CAST(COUNT(DISTINCT e.user_id) AS int) AS "activeUsers",
            CAST(COUNT(e.id) AS int) AS "events",
            ${countIf("e.type = 'login'")} AS "logins"
       FROM ${DAYS}
       LEFT JOIN events e ON e.occurred_at >= d.day_start AND e.occurred_at < d.day_end
      GROUP BY d.date
      ORDER BY d.date`,
    { days: dayBuckets(since, until) },
  );

  const topNames = (type) =>
    select(
      `SELECT ${top(10)} name AS "name", CAST(COUNT(*) AS int) AS "count", CAST(COUNT(DISTINCT user_id) AS int) AS "users"
         FROM events
        WHERE type = :type AND occurred_at BETWEEN :since AND :until
        GROUP BY name
        ORDER BY "count" DESC
      ${limit(10)}`,
      { type, since, until },
    );
  const [topScreens, topTaps] = await Promise.all([topNames('screen_view'), topNames('tap')]);
  const topApis = await select(
    `SELECT ${top(10)} name AS "name", CAST(COUNT(*) AS int) AS "count", CAST(COUNT(DISTINCT user_id) AS int) AS "users",
            CAST(ROUND(AVG(${toNumber(json('properties', 'ms'))}), 0) AS int) AS "avgMs",
            ${countIf(isTrue('success'))} AS "succeeded",
            ${countIf(isFalse('success'))} AS "failed"
       FROM events
      WHERE type = 'api' AND occurred_at BETWEEN :since AND :until
      GROUP BY name
      ORDER BY "count" DESC
      ${limit(10)}`,
    { since, until },
  );

  // What users do, by type (pie chart).
  const byType = await select(
    `SELECT type AS "type", CAST(COUNT(*) AS int) AS "count" FROM events
      WHERE occurred_at BETWEEN :since AND :until GROUP BY type ORDER BY "count" DESC`,
    { since, until },
  );

  // API results (pie chart).
  const [apiResults] = await select(
    `SELECT ${countIf(isTrue('success'))} AS "success",
            ${countIf(isFalse('success'))} AS "failed",
            ${countIf('success IS NULL')} AS "unknown"
       FROM events WHERE type = 'api' AND occurred_at BETWEEN :since AND :until`,
    { since, until },
  );

  // Money transfers: receiver and amount come from the recorded request.
  const amountSql = money(json('e.properties', 'request.body.TransferAmount'));
  const [transfersToday] = await select(
    `SELECT CAST(COUNT(*) AS int) AS "count",
            ${countIf(isTrue('e.success'))} AS "succeeded",
            ${countIf(isFalse('e.success'))} AS "failed",
            CAST(${sumIf(isTrue('e.success'), amountSql)} AS float) AS "amount"
       FROM events e
      WHERE e.type = 'api' AND e.name LIKE '%/TransferBalance' AND e.occurred_at >= :today`,
    { today },
  );
  const recentTransfers = await select(
    `SELECT ${top(10)} CAST(e.id AS varchar(20)) AS "id", e.occurred_at AS "occurredAt", e.success AS "success",
            e.result AS "result", ${json('e.properties', 'request.body.Receiver')} AS "receiver",
            CAST(${amountSql} AS float) AS "amount",
            u.id AS "userId", u.msisdn AS "msisdn", u.first_name AS "firstName", u.last_name AS "lastName"
       FROM events e LEFT JOIN app_users u ON u.id = e.user_id
      WHERE e.type = 'api' AND e.name LIKE '%/TransferBalance' AND e.occurred_at BETWEEN :since AND :until
      ORDER BY e.occurred_at DESC
      ${limit(10)}`,
    { since, until },
  );

  // Two kinds of logout: full (back to phone number) vs locked (back to password).
  const full = "name IN ('logout', 'logout_full')";
  const locked = "name = 'logout_to_password'";
  const [logouts] = await select(
    `SELECT ${countIf(full)} AS "full",
            ${countIf(locked)} AS "toPassword",
            ${countIf(`${full} AND occurred_at >= :today`)} AS "fullToday",
            ${countIf(`${locked} AND occurred_at >= :today`)} AS "toPasswordToday"
       FROM events WHERE type = 'logout' AND occurred_at BETWEEN :since AND :until`,
    { since, until, today },
  );

  // API calls in the last 15 minutes from an app still running the old
  // recorder (no request/response/result captured).
  const outdatedRecent = await Event.count({
    where: {
      type: 'api',
      success: null,
      occurredAt: { [Op.gte]: new Date(Date.now() - 15 * 60_000) },
      [Op.and]: sequelize.literal(hasKey('"Event"."properties"', 'ok')),
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
  const pj = (path) => json('e.properties', path);

  // One row per purchase attempt, with the useful fields pulled out.
  const base = `
    WITH p AS (
      SELECT e.id, e.occurred_at, e.success, e.result, e.user_id,
             COALESCE(${pj('purchase.channel')},
               CASE WHEN e.name LIKE '%SpinerWheel%' THEN 'lucky_wheel'
                    WHEN e.name LIKE '%MMonney%' THEN 'mmoney'
                    WHEN e.name LIKE '%PackageIR%' THEN 'roaming'
                    ELSE 'balance' END) AS channel,
             COALESCE(${pj('purchase.code')}, ${pj('request.body.PackageCode')}, ${pj('request.body.pkCode')}) AS code,
             ${pj('purchase.name')} AS name,
             ${pj('purchase.net')} AS net,
             ${pj('purchase.duration')} AS duration,
             ${pj('purchase.forWhom')} AS for_whom,
             ${pj('purchase.forNumber')} AS for_number,
             ${money(pj('purchase.price'))} AS price
        FROM events e
       WHERE e.type = 'api' AND e.name LIKE '%RegisterPackage%' AND e.occurred_at BETWEEN :since AND :until
    )`;
  const q = (sql, extra = {}) => select(`${base} ${sql}`, { since, until, today, ...extra });
  const ok = isTrue('success');

  const [[totals], [todayTotals], byChannel, topPackages, daily, recent] = await Promise.all([
    q(`SELECT ${countIf(ok)} AS "sold",
              ${countIf(isFalse('success'))} AS "failed",
              ${countIf('success IS NULL')} AS "unknown",
              CAST(${sumIf(ok, 'price')} AS float) AS "revenue",
              ${countIf(`${ok} AND price IS NULL`)} AS "soldNoPrice",
              CAST(COUNT(DISTINCT CASE WHEN ${ok} THEN user_id END) AS int) AS "buyers"
         FROM p`),
    q(`SELECT ${countIf(ok)} AS "sold", CAST(${sumIf(ok, 'price')} AS float) AS "revenue"
         FROM p WHERE occurred_at >= :today`),
    q(`SELECT channel AS "channel", ${countIf(ok)} AS "sold", CAST(${sumIf(ok, 'price')} AS float) AS "revenue"
         FROM p GROUP BY channel ORDER BY "sold" DESC`),
    q(`SELECT ${top(10)} code AS "code", MAX(name) AS "name", MAX(net) AS "net", MAX(duration) AS "duration",
              CAST(MAX(price) AS float) AS "price",
              ${countIf(ok)} AS "sold",
              ${countIf(isFalse('success'))} AS "failed",
              CAST(${sumIf(ok, 'price')} AS float) AS "revenue"
         FROM p WHERE code IS NOT NULL
        GROUP BY code ORDER BY "revenue" DESC, "sold" DESC
      ${limit(10)}`),
    q(
      `SELECT d.date AS "date",
              ${countIf(isTrue('p.success'))} AS "sold",
              CAST(${sumIf(isTrue('p.success'), 'p.price')} AS float) AS "revenue"
         FROM ${DAYS}
         LEFT JOIN p ON p.occurred_at >= d.day_start AND p.occurred_at < d.day_end
        GROUP BY d.date ORDER BY d.date`,
      { days: dayBuckets(since, until) },
    ),
    q(`SELECT ${top(15)} CAST(p.id AS varchar(20)) AS "id", p.occurred_at AS "occurredAt", p.success AS "success",
              p.result AS "result", p.channel AS "channel", p.code AS "code", p.name AS "name", p.net AS "net",
              p.duration AS "duration", CAST(p.price AS float) AS "price", p.for_whom AS "forWhom",
              p.for_number AS "forNumber",
              u.id AS "userId", u.msisdn AS "msisdn", u.first_name AS "firstName", u.last_name AS "lastName"
         FROM p LEFT JOIN app_users u ON u.id = p.user_id
        ORDER BY p.occurred_at DESC
      ${limit(15)}`),
  ]);

  // Data balance from each user's latest snapshot.
  // (SQL Server can't SUM a subquery, so count each user's packages first.)
  const [data] = await select(
    `SELECT ${countIf('c.n > 0')} AS "usersWithPackages",
            CAST(COALESCE(SUM(c.n), 0) AS int) AS "activePackages",
            CAST(COALESCE(SUM(u.data_remain_mb), 0) AS float) AS "remainMb",
            CAST(COALESCE(SUM(u.data_used_mb), 0) AS float) AS "usedMb"
       FROM app_users u
      ${lateral(`SELECT ${jsonLength('u.active_packages')} AS n`, 'c')}
      WHERE u.packages_updated_at IS NOT NULL`,
  );
  const inUse = await select(
    `SELECT ${top(10)} pkg."name" AS "name", CAST(COUNT(*) AS int) AS "users",
            CAST(COALESCE(SUM(${toNumber('pkg."remainMb"')}), 0) AS float) AS "remainMb",
            CAST(COALESCE(SUM(${toNumber('pkg."usedMb"')}), 0) AS float) AS "usedMb"
       FROM app_users
      ${jsonRows('active_packages', 'pkg', { name: 'name', remainMb: 'remainMb', usedMb: 'usedMb' })}
      GROUP BY pkg."name" ORDER BY "users" DESC
      ${limit(10)}`,
  );
  const lowData = await select(
    `SELECT ${top(10)} id AS "id", msisdn AS "msisdn", first_name AS "firstName", last_name AS "lastName",
            data_remain_mb AS "remainMb", data_used_mb AS "usedMb", packages_updated_at AS "updatedAt",
            ${jsonLength('active_packages')} AS "packages"
       FROM app_users
      WHERE packages_updated_at IS NOT NULL
      ORDER BY CASE WHEN data_remain_mb IS NULL THEN 1 ELSE 0 END, data_remain_mb ASC
      ${limit(10)}`,
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
  const rows = await select(
    `SELECT name AS "name",
            CAST(COUNT(*) AS int) AS "uses",
            ${countIf(isTrue('success'))} AS "succeeded",
            ${countIf(isFalse('success'))} AS "failed",
            CAST(COUNT(DISTINCT user_id) AS int) AS "users",
            MAX(occurred_at) AS "lastAt"
       FROM events
      WHERE type = 'api' AND occurred_at BETWEEN :since AND :until ${userId ? 'AND user_id = :userId' : ''}
      GROUP BY name`,
    { since, until, userId },
  );

  return { days, apis: rows };
}
