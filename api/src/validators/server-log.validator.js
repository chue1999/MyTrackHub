import { z } from 'zod';
import { SERVER_LOG_TYPES, SERVER_TASK_ACTIONS } from '../models/index.js';

const opt = (max) => z.string().trim().max(max).optional().nullable();

/** POST /api/v1/server-agent/events — one batch from the agent (may be empty: heartbeat). */
export const ingestSchema = z.object({
  host: z.string().trim().min(1).max(100),
  agentVersion: opt(20),
  startedAt: z.string().datetime({ offset: true }).optional().nullable(),
  auditd: z.boolean().optional().nullable(),
  // Cache sizes in bytes (sent every few minutes), e.g. { journal: 123, apt: 0 }.
  caches: z.record(z.number().nonnegative().nullable()).optional().nullable(),
  events: z
    .array(
      z.object({
        key: z.string().trim().min(8).max(64),
        at: z.string().datetime({ offset: true }),
        type: z.enum(SERVER_LOG_TYPES),
        user: opt(64),
        runAs: opt(64),
        sourceIp: opt(64),
        success: z.boolean().optional().default(true),
        summary: opt(500),
        detail: z.record(z.unknown()).optional().nullable(),
      }),
    )
    .max(500)
    .default([]),
});

/** GET /admin/server-logs */
export const listQuery = z.object({
  search: z.string().trim().max(100).optional().default(''),
  type: z.enum(SERVER_LOG_TYPES).optional(),
  group: z.enum(['logins', 'failed', 'sudo', 'files', 'accounts', 'tamper', 'maintenance']).optional(),
  host: z.string().trim().max(100).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  // Up to 5000 so the Excel export can page through quickly.
  pageSize: z.coerce.number().int().min(1).max(5000).optional().default(50),
});

/** GET /api/v1/server-agent/tasks?host= */
export const agentTasksQuery = z.object({ host: z.string().trim().min(1).max(100) });

/** POST /api/v1/server-agent/tasks/:id/result */
export const taskResultSchema = z.object({
  host: z.string().trim().min(1).max(100),
  ok: z.boolean(),
  freedBytes: z.number().nonnegative().optional().nullable(),
  output: z.string().max(20000).optional().default(''),
});

/** POST /admin/server/tasks — ask the agent on `host` to clear one cache. */
export const createTaskSchema = z.object({
  host: z.string().trim().min(1).max(100),
  action: z.enum(SERVER_TASK_ACTIONS),
});

/** GET /admin/server/history */
export const historyQuery = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(5000).optional().default(100),
});
