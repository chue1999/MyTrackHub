import { ipOf } from '../services/ccare-log.service.js';
import * as serverLogs from '../services/server-log.service.js';
import { HttpError } from '../utils/http-error.js';

/** POST /api/v1/server-agent/events — a batch (or heartbeat) from the server agent. */
export async function ingest(req, res) {
  const stored = await serverLogs.ingest(req.body, ipOf(req));
  res.json({ ok: true, stored });
}

/** GET /admin/server-logs */
export async function list(req, res) {
  res.json(await serverLogs.list(req.validatedQuery));
}

/** GET /admin/server-logs/summary */
export async function summary(_req, res) {
  res.json(await serverLogs.summary());
}

/** GET /admin/server-logs/hosts */
export async function hosts(_req, res) {
  res.json(await serverLogs.hosts());
}

/** GET /admin/server-logs/:id */
export async function get(req, res) {
  const row = await serverLogs.getOne(req.params.id);
  if (!row) throw HttpError.notFound('This server entry was not found.');
  res.json(row);
}
