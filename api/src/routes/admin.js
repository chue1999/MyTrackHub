import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { Op, QueryTypes } from 'sequelize';
import { z } from 'zod';
import { sequelize } from '../db.js';
import { Admin, AppUser, Event, EVENT_TYPES } from '../models/index.js';
import { requireAdmin, signAdminToken } from '../middleware/auth.js';
import { createTicket, liveClientCount, streamHandler } from '../live.js';

const router = Router();

// ── helpers ──────────────────────────────────────────────────────────

function paging(query, maxSize = 100) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, Number.parseInt(query.pageSize, 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function dateRange(query) {
  const where = {};
  const from = query.from ? new Date(query.from) : null;
  const to = query.to ? new Date(query.to) : null;
  if (from && !Number.isNaN(+from)) where[Op.gte] = from;
  if (to && !Number.isNaN(+to)) where[Op.lte] = to;
  return Object.getOwnPropertySymbols(where).length ? where : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Digits of a phone search without the 856 / leading 0 prefix: "020 5555 1234" → "2055551234". */
const searchDigits = (s) => String(s).replace(/\D/g, '').replace(/^856/, '').replace(/^0+/, '');

const like = (s) => `%${String(s).replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

// ── auth ─────────────────────────────────────────────────────────────

const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20 });

router.post('/auth/login', loginLimiter, async (req, res, next) => {
  try {
    const { username, password } = z
      .object({ username: z.string().min(1), password: z.string().min(1) })
      .parse(req.body);
    const admin = await Admin.scope('withPassword').findOne({ where: { username } });
    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      return res.status(401).json({ message: 'Wrong username or password' });
    }
    if (!admin.isActive) {
      return res.status(403).json({ message: 'This account is disabled. Ask an administrator.' });
    }
    await admin.update({ lastLoginAt: new Date() });
    res.json({
      token: signAdminToken(admin),
      admin: { id: admin.id, username: admin.username, displayName: admin.displayName, role: admin.role },
    });
  } catch (err) {
    next(err);
  }
});

// Real-time stream (authenticated by a one-time ticket, see live.js).
router.get('/stream', streamHandler);

router.use(requireAdmin);

// Disabled or deleted accounts lose access immediately, not when the token expires.
router.use(async (req, res, next) => {
  try {
    const me = await Admin.findByPk(req.admin.sub);
    if (!me || !me.isActive) return res.status(401).json({ message: 'Account disabled' });
    req.me = me;
    next();
  } catch (err) {
    next(err);
  }
});

const requireRoleAdmin = (req, res, next) =>
  req.me?.role === 'admin' ? next() : res.status(403).json({ message: 'Only administrators can do this' });

/** POST /stream/ticket — one-time ticket for opening the live stream. */
router.post('/stream/ticket', (req, res) => {
  res.json({ ticket: createTicket(req.admin.sub), viewers: liveClientCount() });
});

router.get('/auth/me', (req, res) => res.json(req.me));

// ── admin accounts ───────────────────────────────────────────────────

const accountSchema = z.object({
  username: z.string().trim().min(3).max(60).regex(/^[a-zA-Z0-9._-]+$/, 'Letters, numbers, . _ - only'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  displayName: z.string().trim().max(100).optional().nullable(),
  role: z.enum(['admin', 'viewer']).default('viewer'),
  isActive: z.boolean().default(true),
});

router.get('/accounts', requireRoleAdmin, async (_req, res) => {
  res.json(await Admin.findAll({ order: [['createdAt', 'ASC']] }));
});

router.post('/accounts', requireRoleAdmin, async (req, res, next) => {
  try {
    const data = accountSchema.parse(req.body);
    if (await Admin.findOne({ where: { username: data.username } })) {
      return res.status(409).json({ message: 'This username is already taken' });
    }
    const { password, ...rest } = data;
    const created = await Admin.create({ ...rest, passwordHash: await bcrypt.hash(password, 10) });
    res.status(201).json(await Admin.findByPk(created.id));
  } catch (err) {
    next(err);
  }
});

const activeAdmins = (exceptId) =>
  Admin.count({ where: { role: 'admin', isActive: true, id: { [Op.ne]: exceptId } } });

router.patch('/accounts/:id', requireRoleAdmin, async (req, res, next) => {
  try {
    const data = accountSchema.partial().parse(req.body);
    const account = await Admin.findByPk(req.params.id);
    if (!account) return res.status(404).json({ message: 'Account not found' });
    if (data.username && data.username !== account.username && (await Admin.findOne({ where: { username: data.username } }))) {
      return res.status(409).json({ message: 'This username is already taken' });
    }
    const losingAdmin = (data.role === 'viewer' || data.isActive === false) && account.role === 'admin' && account.isActive;
    if (losingAdmin && (await activeAdmins(account.id)) === 0) {
      return res.status(400).json({ message: 'There must always be at least one active administrator' });
    }
    const { password, ...rest } = data;
    if (password) rest.passwordHash = await bcrypt.hash(password, 10);
    await account.update(rest);
    res.json(await Admin.findByPk(account.id));
  } catch (err) {
    next(err);
  }
});

router.delete('/accounts/:id', requireRoleAdmin, async (req, res, next) => {
  try {
    const account = await Admin.findByPk(req.params.id);
    if (!account) return res.status(404).json({ message: 'Account not found' });
    if (account.id === req.me.id) return res.status(400).json({ message: 'You cannot delete your own account' });
    if (account.role === 'admin' && account.isActive && (await activeAdmins(account.id)) === 0) {
      return res.status(400).json({ message: 'There must always be at least one active administrator' });
    }
    await account.destroy();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/** Anyone can change their own password. */
router.post('/auth/password', async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = z
      .object({ currentPassword: z.string().min(1), newPassword: z.string().min(8, 'Password must be at least 8 characters') })
      .parse(req.body);
    const me = await Admin.scope('withPassword').findByPk(req.me.id);
    if (!(await bcrypt.compare(currentPassword, me.passwordHash))) {
      return res.status(400).json({ message: 'Current password is wrong' });
    }
    await me.update({ passwordHash: await bcrypt.hash(newPassword, 10) });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── dashboard ────────────────────────────────────────────────────────

/** GET /stats/overview?days=14 — headline numbers, daily chart, top screens/taps. */
router.get('/stats/overview', async (req, res, next) => {
  try {
    const days = Math.min(90, Math.max(1, Number.parseInt(req.query.days, 10) || 14));
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const since = new Date(startOfToday);
    since.setDate(since.getDate() - (days - 1));

    const [totalUsers, newUsersToday, eventsToday, loginsToday, activeToday, failedToday] = await Promise.all([
      AppUser.count(),
      AppUser.count({ where: { firstSeenAt: { [Op.gte]: startOfToday } } }),
      Event.count({ where: { occurredAt: { [Op.gte]: startOfToday } } }),
      Event.count({ where: { type: 'login', occurredAt: { [Op.gte]: startOfToday } } }),
      Event.count({
        where: { occurredAt: { [Op.gte]: startOfToday }, userId: { [Op.ne]: null } },
        distinct: true,
        col: 'user_id',
      }),
      Event.count({ where: { success: false, occurredAt: { [Op.gte]: startOfToday } } }),
    ]);

    const daily = await sequelize.query(
      `SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
              COALESCE(COUNT(DISTINCT e.user_id), 0)::int AS "activeUsers",
              COALESCE(COUNT(e.id), 0)::int AS events,
              COALESCE(COUNT(e.id) FILTER (WHERE e.type = 'login'), 0)::int AS logins
         FROM generate_series(:since::date, CURRENT_DATE, interval '1 day') AS d(day)
         LEFT JOIN events e ON e.occurred_at >= d.day AND e.occurred_at < d.day + interval '1 day'
        GROUP BY d.day
        ORDER BY d.day`,
      { replacements: { since }, type: QueryTypes.SELECT },
    );

    const top = (type) =>
      sequelize.query(
        `SELECT name, COUNT(*)::int AS count, COUNT(DISTINCT user_id)::int AS users
           FROM events
          WHERE type = :type AND occurred_at >= :since
          GROUP BY name
          ORDER BY count DESC
          LIMIT 10`,
        { replacements: { type, since }, type: QueryTypes.SELECT },
      );
    const [topScreens, topTaps] = await Promise.all([top('screen_view'), top('tap')]);
    const topApis = await sequelize.query(
      `SELECT name, COUNT(*)::int AS count, COUNT(DISTINCT user_id)::int AS users,
              ROUND(AVG((properties->>'ms')::numeric))::int AS "avgMs",
              COUNT(*) FILTER (WHERE success IS TRUE)::int AS succeeded,
              COUNT(*) FILTER (WHERE success IS FALSE)::int AS failed
         FROM events
        WHERE type = 'api' AND occurred_at >= :since
        GROUP BY name
        ORDER BY count DESC
        LIMIT 10`,
      { replacements: { since }, type: QueryTypes.SELECT },
    );

    // What users do, by type (pie chart).
    const byType = await sequelize.query(
      `SELECT type, COUNT(*)::int AS count FROM events
        WHERE occurred_at >= :since GROUP BY type ORDER BY count DESC`,
      { replacements: { since }, type: QueryTypes.SELECT },
    );

    // API results (pie chart).
    const [apiResults] = await sequelize.query(
      `SELECT COUNT(*) FILTER (WHERE success IS TRUE)::int AS success,
              COUNT(*) FILTER (WHERE success IS FALSE)::int AS failed,
              COUNT(*) FILTER (WHERE success IS NULL)::int AS unknown
         FROM events WHERE type = 'api' AND occurred_at >= :since`,
      { replacements: { since }, type: QueryTypes.SELECT },
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
      { replacements: { today: startOfToday }, type: QueryTypes.SELECT },
    );
    const recentTransfers = await sequelize.query(
      `SELECT e.id::text AS id, e.occurred_at AS "occurredAt", e.success, e.result,
              e.properties->'request'->'body'->>'Receiver' AS receiver,
              ${amountSql}::float AS amount,
              u.id AS "userId", u.msisdn, u.first_name AS "firstName", u.last_name AS "lastName"
         FROM events e LEFT JOIN app_users u ON u.id = e.user_id
        WHERE e.type = 'api' AND e.name LIKE '%/TransferBalance' AND e.occurred_at >= :since
        ORDER BY e.occurred_at DESC
        LIMIT 10`,
      { replacements: { since }, type: QueryTypes.SELECT },
    );

    // Two kinds of logout: full (back to phone number) vs locked (back to password).
    const [logouts] = await sequelize.query(
      `SELECT COUNT(*) FILTER (WHERE name IN ('logout', 'logout_full'))::int AS full,
              COUNT(*) FILTER (WHERE name = 'logout_to_password')::int AS "toPassword",
              COUNT(*) FILTER (WHERE name IN ('logout', 'logout_full') AND occurred_at >= :today)::int AS "fullToday",
              COUNT(*) FILTER (WHERE name = 'logout_to_password' AND occurred_at >= :today)::int AS "toPasswordToday"
         FROM events WHERE type = 'logout' AND occurred_at >= :since`,
      { replacements: { since, today: startOfToday }, type: QueryTypes.SELECT },
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
      where: { success: false, occurredAt: { [Op.gte]: startOfToday } },
      order: [['occurredAt', 'DESC'], ['id', 'DESC']],
      limit: 6,
      include: [{ model: AppUser, as: 'user', attributes: ['id', 'msisdn', 'firstName', 'lastName'] }],
    });

    res.json({
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
    });
  } catch (err) {
    next(err);
  }
});

// ── packages: sold, revenue, data balance ───────────────────────────

/**
 * GET /stats/packages?days=30
 * Purchases come from the app's RegisterPackage* API calls (price attached by
 * the app); data balance comes from each user's latest active-packages snapshot.
 */
router.get('/stats/packages', async (req, res, next) => {
  try {
    const days = Math.min(365, Math.max(1, Number.parseInt(req.query.days, 10) || 30));
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const since = new Date(startOfToday);
    since.setDate(since.getDate() - (days - 1));

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
         WHERE e.type = 'api' AND e.name LIKE '%RegisterPackage%' AND e.occurred_at >= :since
      )`;
    const q = (sql, extra = {}) =>
      sequelize.query(`${base} ${sql}`, { replacements: { since, today: startOfToday, ...extra }, type: QueryTypes.SELECT });

    const [[totals], [today], byChannel, topPackages, daily, recent] = await Promise.all([
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
           FROM generate_series(:since::date, CURRENT_DATE, interval '1 day') AS d(day)
           LEFT JOIN p ON p.occurred_at >= d.day AND p.occurred_at < d.day + interval '1 day'
          GROUP BY d.day ORDER BY d.day`,
        { replacements: { since }, type: QueryTypes.SELECT },
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

    res.json({ days, totals, today, byChannel, topPackages, daily, recent, data, inUse, lowData });
  } catch (err) {
    next(err);
  }
});

// ── app features ─────────────────────────────────────────────────────

/**
 * GET /stats/features?days=30&userId=
 * Usage of every API the app called: uses, successes, failures, users and
 * when it was last used. The website groups these into app features.
 */
router.get('/stats/features', async (req, res, next) => {
  try {
    const days = Math.min(365, Math.max(1, Number.parseInt(req.query.days, 10) || 30));
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));
    const userId = req.query.userId && UUID.test(req.query.userId) ? req.query.userId : null;
    const rows = await sequelize.query(
      `SELECT name,
              COUNT(*)::int AS uses,
              COUNT(*) FILTER (WHERE success IS TRUE)::int AS succeeded,
              COUNT(*) FILTER (WHERE success IS FALSE)::int AS failed,
              COUNT(DISTINCT user_id)::int AS users,
              MAX(occurred_at) AS "lastAt"
         FROM events
        WHERE type = 'api' AND occurred_at >= :since ${userId ? 'AND user_id = :userId' : ''}
        GROUP BY name`,
      { replacements: { since, userId }, type: QueryTypes.SELECT },
    );
    res.json({ days, apis: rows });
  } catch (err) {
    next(err);
  }
});

// ── users ────────────────────────────────────────────────────────────

/** GET /users?search=&page=&pageSize=&sort=lastSeenAt|loginCount|firstSeenAt */
router.get('/users', async (req, res, next) => {
  try {
    const { page, pageSize, offset } = paging(req.query);
    const where = {};
    const search = String(req.query.search || '').trim();
    if (search) {
      const digits = searchDigits(search);
      where[Op.or] = [
        { firstName: { [Op.iLike]: like(search) } },
        { lastName: { [Op.iLike]: like(search) } },
        ...(digits ? [{ msisdn: { [Op.like]: like(digits) } }] : []),
      ];
    }
    const sortable = {
      lastSeenAt: ['lastSeenAt', 'DESC'],
      loginCount: ['loginCount', 'DESC'],
      firstSeenAt: ['firstSeenAt', 'DESC'],
      dataRemainMb: ['dataRemainMb', 'ASC NULLS LAST'],
    };
    const sort = sortable[req.query.sort] || sortable.lastSeenAt;

    const { rows, count } = await AppUser.findAndCountAll({
      where,
      order: [sort],
      limit: pageSize,
      offset,
      attributes: {
        exclude: ['activePackages'],
        include: [
          [sequelize.literal('(SELECT COUNT(*)::int FROM events e WHERE e.user_id = "AppUser"."id")'), 'actionCount'],
          [sequelize.literal('(SELECT COUNT(*)::int FROM events e WHERE e.user_id = "AppUser"."id" AND e.success IS FALSE)'), 'failedCount'],
          [sequelize.literal(`COALESCE(jsonb_array_length("AppUser"."active_packages"), 0)`), 'packageCount'],
        ],
      },
    });
    res.json({ items: rows, total: count, page, pageSize });
  } catch (err) {
    next(err);
  }
});

/** GET /users/:id — profile plus a summary of what they use most. */
router.get('/users/:id', async (req, res, next) => {
  try {
    const user = UUID.test(req.params.id) ? await AppUser.findByPk(req.params.id) : null;
    if (!user) return res.status(404).json({ message: 'User not found' });

    const [summary] = await sequelize.query(
      `SELECT COUNT(*)::int AS "totalEvents",
              COUNT(*) FILTER (WHERE type = 'screen_view')::int AS "screenViews",
              COUNT(*) FILTER (WHERE type = 'tap')::int AS taps,
              COUNT(*) FILTER (WHERE success IS FALSE)::int AS failed,
              COUNT(DISTINCT session_id)::int AS sessions
         FROM events WHERE user_id = :id`,
      { replacements: { id: user.id }, type: QueryTypes.SELECT },
    );
    const topScreens = await sequelize.query(
      `SELECT name, COUNT(*)::int AS count FROM events
        WHERE user_id = :id AND type = 'screen_view'
        GROUP BY name ORDER BY count DESC LIMIT 5`,
      { replacements: { id: user.id }, type: QueryTypes.SELECT },
    );
    const devices = await sequelize.query(
      `SELECT device_id AS "deviceId", device_model AS "deviceModel", platform,
              MAX(occurred_at) AS "lastUsedAt"
         FROM events WHERE user_id = :id AND device_id IS NOT NULL
        GROUP BY device_id, device_model, platform
        ORDER BY "lastUsedAt" DESC LIMIT 10`,
      { replacements: { id: user.id }, type: QueryTypes.SELECT },
    );

    res.json({ user, summary, topScreens, devices });
  } catch (err) {
    next(err);
  }
});

/** PATCH /users/:id — staff can correct the name or keep a note. */
router.patch('/users/:id', async (req, res, next) => {
  try {
    if (req.me.role !== 'admin') return res.status(403).json({ message: 'Only administrators can edit users' });
    const data = z
      .object({
        firstName: z.string().trim().max(100).optional().nullable(),
        lastName: z.string().trim().max(100).optional().nullable(),
        note: z.string().max(5000).optional().nullable(),
      })
      .parse(req.body);
    const user = UUID.test(req.params.id) ? await AppUser.findByPk(req.params.id) : null;
    if (!user) return res.status(404).json({ message: 'User not found' });
    await user.update(data);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// ── events ───────────────────────────────────────────────────────────

/**
 * GET /events?userId=&type=&search=&from=&to=&page=&pageSize=
 * Used both for one user's timeline and for the global event explorer.
 */
router.get('/events', async (req, res, next) => {
  try {
    const { page, pageSize, offset } = paging(req.query, 200);
    const where = {};
    if (req.query.userId) {
      if (!UUID.test(req.query.userId)) return res.status(400).json({ message: 'Invalid userId' });
      where.userId = req.query.userId;
    }
    if (EVENT_TYPES.includes(req.query.type)) where.type = req.query.type;
    // apis=TransferBalance,TransferConfirmOtp,tplusqueue/add → only those APIs (a feature)
    const apis = String(req.query.apis || '')
      .split(',')
      .map((x) => x.trim())
      .filter((x) => /^[A-Za-z0-9_\-/]{1,80}$/.test(x))
      .slice(0, 40);
    if (apis.length) {
      where.type = 'api';
      where[Op.and] = [...(where[Op.and] || []), { [Op.or]: apis.map((a) => ({ name: { [Op.like]: `%/${a}` } })) }];
    }
    if (req.query.success === 'true') where.success = true;
    if (req.query.success === 'false') where.success = false;
    const range = dateRange(req.query);
    if (range) where.occurredAt = range;
    const search = String(req.query.search || '').trim();
    if (search) {
      const digits = searchDigits(search);
      where[Op.or] = [
        { name: { [Op.iLike]: like(search) } },
        { screen: { [Op.iLike]: like(search) } },
        { result: { [Op.iLike]: like(search) } },
        // the user's name (e.g. typing "Somsack" finds his actions too)
        { '$user.first_name$': { [Op.iLike]: like(search) } },
        { '$user.last_name$': { [Op.iLike]: like(search) } },
        ...(digits.length >= 3 ? [{ msisdn: { [Op.like]: like(digits) } }] : []),
        // Also look inside request/response details (e.g. a transfer receiver).
        ...(digits.length >= 6
          ? [sequelize.where(sequelize.cast(sequelize.col('properties'), 'text'), { [Op.like]: like(digits) })]
          : []),
      ];
    }

    const { rows, count } = await Event.findAndCountAll({
      where,
      order: [['occurredAt', 'DESC'], ['id', 'DESC']],
      limit: pageSize,
      offset,
      include: [{ model: AppUser, as: 'user', attributes: ['id', 'msisdn', 'firstName', 'lastName'] }],
    });
    res.json({ items: rows, total: count, page, pageSize });
  } catch (err) {
    next(err);
  }
});

/** GET /events/:id — one event, for the details page. */
router.get('/events/:id', async (req, res, next) => {
  try {
    if (!/^\d{1,18}$/.test(req.params.id)) return res.status(404).json({ message: 'Action not found' });
    const event = await Event.findByPk(req.params.id, {
      include: [{ model: AppUser, as: 'user', attributes: ['id', 'msisdn', 'firstName', 'lastName'] }],
    });
    if (!event) return res.status(404).json({ message: 'Action not found' });
    res.json(event);
  } catch (err) {
    next(err);
  }
});

export default router;
