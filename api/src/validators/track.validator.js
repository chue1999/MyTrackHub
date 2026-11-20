import { z } from 'zod';
import { EVENT_TYPES } from '../models/index.js';

const eventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  // Long values are shortened instead of rejecting the whole batch.
  name: z
    .string()
    .trim()
    .min(1)
    .transform((s) => s.slice(0, 150)),
  screen: z
    .string()
    .trim()
    .transform((s) => s.slice(0, 150))
    .optional()
    .nullable(),
  success: z.boolean().optional().nullable(),
  result: z
    .string()
    .transform((s) => s.slice(0, 300))
    .optional()
    .nullable(),
  sessionId: z.string().max(64).optional().nullable(),
  properties: z.record(z.string(), z.any()).optional().nullable(),
  occurredAt: z.coerce.date().optional(),
});

/** POST /api/v1/track — one batch of up to 100 events from one device. */
export const trackBatchSchema = z.object({
  msisdn: z.string().max(30).optional().nullable(),
  firstName: z.string().trim().max(100).optional().nullable(),
  lastName: z.string().trim().max(100).optional().nullable(),
  deviceId: z.string().max(100).optional().nullable(),
  deviceModel: z.string().max(100).optional().nullable(),
  platform: z.string().max(20).optional().nullable(),
  appVersion: z.string().max(30).optional().nullable(),
  events: z.array(eventSchema).min(1).max(100),
});
