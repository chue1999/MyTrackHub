import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { Op, QueryTypes } from 'sequelize';
import { z } from 'zod';
import { sequelize } from '../db.js';
import { Admin, AppUser, Event, EVENT_TYPES } from '../models/index.js';
import { requireAdmin, signAdminToken } from '../middleware/auth.js';

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

const like = (s) => `%${String(s).replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

// ── auth ─────────────────────────────────────────────────────────────

const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20 });

router.post('/auth/login', loginLimiter, async (req, res, next) => {
  try {
    const { username, password } = z
      .object({ username: z.string().min(1), password: z.string().min(1) })
      .parse(req.body);
    const admin = await Admin.findOne({ where: { username } });
    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      return res.status(401).json({ message: 'Wrong username or password' });
    }
    await admin.update({ lastLoginAt: new Date() });
    res.json({
      token: signAdminToken(admin),
      admin: { id: admin.id, username: admin.username, displayName: admin.displayName },
    });
  } catch (err) {
    next(err);
  }
});

router.use(requireAdmin);

router.get('/auth/me', async (req, res) => {
  const admin = await Admin.findByPk(req.admin.sub, {
    attributes: ['id', 'username', 'displayName', 'lastLoginAt'],
  });
  if (!admin) return res.status(401).json({ message: 'Account no longer exists' });
  res.json(admin);
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

    const [totalUsers, newUsersToday, eventsToday, loginsToday, activeToday] = await Promise.all([
      AppUser.count(),
      AppUser.count({ where: { firstSeenAt: { [Op.gte]: startOfToday } } }),
      Event.count({ where: { occurredAt: { [Op.gte]: startOfToday } } }),
      Event.count({ where: { type: 'login', occurredAt: { [Op.gte]: startOfToday } } }),
      Event.count({
        where: { occurredAt: { [Op.gte]: startOfToday }, userId: { [Op.ne]: null } },
        distinct: true,
        col: 'user_id',
      }),
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

    res.json({
      totals: { totalUsers, newUsersToday, activeToday, eventsToday, loginsToday },
      daily,
      topScreens,
      topTaps,
    });
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
      const digits = search.replace(/\D/g, '');
      where[Op.or] = [
        { firstName: { [Op.iLike]: like(search) } },
        { lastName: { [Op.iLike]: like(search) } },
        ...(digits ? [{ msisdn: { [Op.like]: like(digits) } }] : []),
      ];
    }
    const sortable = { lastSeenAt: 'lastSeenAt', loginCount: 'loginCount', firstSeenAt: 'firstSeenAt' };
    const sort = sortable[req.query.sort] || 'lastSeenAt';

    const { rows, count } = await AppUser.findAndCountAll({
      where,
      order: [[sort, 'DESC']],
      limit: pageSize,
      offset,
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
    const range = dateRange(req.query);
    if (range) where.occurredAt = range;
    const search = String(req.query.search || '').trim();
    if (search) {
      const digits = search.replace(/\D/g, '');
      where[Op.or] = [
        { name: { [Op.iLike]: like(search) } },
        { screen: { [Op.iLike]: like(search) } },
        ...(digits.length >= 3 ? [{ msisdn: { [Op.like]: like(digits) } }] : []),
      ];
    }

    const { rows, count } = await Event.findAndCountAll({
      where,
      order: [['occurredAt', 'DESC'], ['id', 'DESC']],
      limit: pageSize,
      offset,
      include: req.query.userId
        ? []
        : [{ model: AppUser, as: 'user', attributes: ['id', 'msisdn', 'firstName', 'lastName'] }],
    });
    res.json({ items: rows, total: count, page, pageSize });
  } catch (err) {
    next(err);
  }
});

export default router;
