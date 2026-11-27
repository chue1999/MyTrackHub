import { ipOf } from '../services/ccare-log.service.js';
import { history } from '../services/server-metrics.service.js';
import { status } from '../services/server-status.service.js';
import * as tasks from '../services/server-task.service.js';

/** GET /admin/server/status — capacity of the server running the API + website. */
export async function getStatus(_req, res) {
  res.json(await status());
}

/** GET /admin/server/caches — the Clear cache page. */
export async function caches(_req, res) {
  res.json(await tasks.overview());
}

/** GET /admin/server/tasks — recent clear-cache tasks. */
export async function listTasks(_req, res) {
  res.json(await tasks.recentTasks());
}

/** POST /admin/server/tasks — ask the agent to clear one cache (logged). */
export async function createTask(req, res) {
  res.status(201).json(await tasks.request(req.body, req.me, ipOf(req)));
}

/** GET /api/v1/server-agent/tasks?host= — the agent picks up waiting tasks. */
export async function agentTasks(req, res) {
  res.json(await tasks.claim(req.validatedQuery.host));
}

/** POST /api/v1/server-agent/tasks/:id/result — the agent reports a task's outcome. */
export async function agentTaskResult(req, res) {
  await tasks.finish(req.params.id, req.body);
  res.json({ ok: true });
}

/** GET /admin/server/history — capacity readings over time (with date & time). */
export async function getHistory(req, res) {
  res.json(await history(req.validatedQuery));
}
