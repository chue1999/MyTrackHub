import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { sequelize } from '../db.js';
import { AppUser, Event, EVENT_TYPES } from '../models/index.js';
import { requireAppKey } from '../middleware/auth.js';
import { broadcast } from '../live.js';
import { normalizeMsisdn, sanitizeProperties } from '../utils/sanitize.js';

const router = Router();

const eventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  // Long values are shortened instead of rejecting the event.
  name: z.string().trim().min(1).transform((s) => s.slice(0, 150)),
  screen: z.string().trim().transform((s) => s.slice(0, 150)).optional().nullable(),
  success: z.boolean().optional().nullable(),
  result: z.string().transform((s) => s.slice(0, 300)).optional().nullable(),
  sessionId: z.string().max(64).optional().nullable(),
  properties: z.record(z.string(), z.any()).optional().nullable(),
  occurredAt: z.coerce.date().optional(),
});

const batchSchema = z.object({
  msisdn: z.string().max(30).optional().nullable(),
  firstName: z.string().trim().max(100).optional().nullable(),
  lastName: z.string().trim().max(100).optional().nullable(),
  deviceId: z.string().max(100).optional().nullable(),
  deviceModel: z.string().max(100).optional().nullable(),
  platform: z.string().max(20).optional().nullable(),
  appVersion: z.string().max(30).optional().nullable(),
  events: z.array(eventSchema).min(1).max(100),
});

const limiter = rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false });

/**
 * POST /api/v1/track
 * Header: x-api-key
 * Body: { msisdn, firstName, lastName, deviceId, platform, appVersion, deviceModel,
 *         events: [{ type, name, screen, sessionId, properties, occurredAt }] }
 */
router.post('/', limiter, requireAppKey, async (req, res, next) => {
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid payload', issues: parsed.error.issues });
  }
  const body = parsed.data;
  const msisdn = normalizeMsisdn(body.msisdn);
  const now = new Date();
  // Don't trust device clocks blindly: clamp future timestamps to "now".
  const when = (d) => (d && d <= now ? d : now);

  try {
    const result = await sequelize.transaction(async (transaction) => {
      let user = null;
      if (msisdn) {
        [user] = await AppUser.findOrCreate({
          where: { msisdn },
          defaults: { msisdn },
          transaction,
        });
        const logins = body.events.filter((e) => e.type === 'login');
        const lastEventAt = body.events.reduce(
          (max, e) => (when(e.occurredAt) > max ? when(e.occurredAt) : max),
          user.lastSeenAt,
        );
        const updates = {
          lastSeenAt: lastEventAt,
          platform: body.platform ?? user.platform,
          appVersion: body.appVersion ?? user.appVersion,
          deviceModel: body.deviceModel ?? user.deviceModel,
        };
        if (body.firstName) updates.firstName = body.firstName;
        if (body.lastName) updates.lastName = body.lastName;
        if (logins.length) {
          updates.loginCount = user.loginCount + logins.length;
          updates.lastLoginAt = when(logins[logins.length - 1].occurredAt);
        }
        await user.update(updates, { transaction });
      }

      const rows = body.events.map((e) => ({
        userId: user?.id ?? null,
        msisdn,
        sessionId: e.sessionId ?? null,
        type: e.type,
        name: e.name,
        screen: e.screen ?? null,
        properties: sanitizeProperties(e.properties ?? {}),
        success: e.success ?? null,
        result: e.result ?? null,
        platform: body.platform ?? null,
        appVersion: body.appVersion ?? null,
        deviceId: body.deviceId ?? null,
        deviceModel: body.deviceModel ?? null,
        ip: req.ip,
        occurredAt: when(e.occurredAt),
      }));
      const created = await Event.bulkCreate(rows, { transaction, returning: true });
      return { created, user };
    });

    res.status(202).json({ accepted: result.created.length });

    // Push to the admin website right away.
    const u = result.user;
    const userInfo = u
      ? { id: u.id, msisdn: u.msisdn, firstName: u.firstName, lastName: u.lastName }
      : null;
    broadcast('events', {
      user: u ? u.toJSON() : null,
      events: result.created.map((e) => ({ ...e.toJSON(), id: String(e.id), user: userInfo })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
