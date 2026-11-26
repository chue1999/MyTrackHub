import { Op } from 'sequelize';
import { config } from '../config/index.js';
import { ServerAgent, ServerLog } from '../models/index.js';

/** Filter groups used by the web page's chips. */
const GROUPS = {
  logins: { type: { [Op.in]: ['login_ok', 'login_fail', 'logout'] } },
  failed: { success: false },
  sudo: { type: { [Op.in]: ['sudo', 'su'] } },
  files: { type: { [Op.in]: ['file_delete', 'file_change'] } },
  accounts: { type: 'account_change' },
  tamper: { type: { [Op.in]: ['audit_tamper', 'agent_stop'] } },
  maintenance: { type: 'maintenance' },
};

/** Writes one entry from the API itself (cache-clear requests and results). */
export async function record(entry) {
  await ServerLog.create({ success: true, receivedAt: new Date(), ...entry });
}

// SQL Server allows ~2100 parameters per statement: 11 columns × 150 rows fits.
const INSERT_CHUNK = 150;

/**
 * Stores one agent batch. Entries already stored (same host + key, e.g. a batch
 * re-sent after a network error) are skipped. Every batch also counts as a
 * heartbeat. Returns how many new entries were stored.
 */
export async function ingest({ host, agentVersion, startedAt, auditd, caches, events }, ip) {
  // Only overwrite what this batch actually reports.
  await ServerAgent.upsert({
    host,
    lastSeenAt: new Date(),
    lastIp: ip ?? null,
    ...(agentVersion ? { agentVersion } : {}),
    ...(typeof auditd === 'boolean' ? { auditd } : {}),
    ...(startedAt ? { startedAt: new Date(startedAt) } : {}),
    // Cache sizes only arrive every few minutes; keep the last ones in between.
    ...(caches ? { caches, cachesAt: new Date() } : {}),
  });
  if (!events.length) return 0;

  // Drop duplicates inside the batch, then those already in the table.
  const byKey = new Map(events.map((e) => [e.key, e]));
  const existing = await ServerLog.findAll({
    attributes: ['eventKey'],
    where: { host, eventKey: { [Op.in]: [...byKey.keys()] } },
  });
  for (const r of existing) byKey.delete(r.eventKey);

  const now = new Date();
  const rows = [...byKey.values()].map((e) => ({
    host,
    eventKey: e.key,
    at: new Date(e.at),
    type: e.type,
    user: e.user ?? null,
    runAs: e.runAs ?? null,
    sourceIp: e.sourceIp ?? null,
    success: e.success ?? true,
    summary: e.summary ?? null,
    detail: e.detail ?? null,
    receivedAt: now,
  }));
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) await ServerLog.bulkCreate(rows.slice(i, i + INSERT_CHUNK));
  return rows.length;
}

/** A page of server entries, newest first. */
export async function list({ search = '', type, group, host, from, to, page = 1, pageSize = 50 }) {
  const and = [];
  if (type) and.push({ type });
  if (group) and.push(GROUPS[group]);
  if (host) and.push({ host });
  if (from || to) {
    const at = {};
    if (from) at[Op.gte] = new Date(from);
    if (to) at[Op.lte] = new Date(to);
    and.push({ at });
  }
  if (search) {
    const like = { [Op.like]: `%${search}%` };
    and.push({ [Op.or]: [{ user: like }, { runAs: like }, { sourceIp: like }, { summary: like }, { host: like }] });
  }
  const { rows, count } = await ServerLog.findAndCountAll({
    where: and.length ? { [Op.and]: and } : {},
    order: [
      ['at', 'DESC'],
      ['id', 'DESC'],
    ],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  return { rows, total: count, page, pageSize };
}

/** One entry (null if missing). */
export function getOne(id) {
  return ServerLog.findByPk(Number(id));
}

/** Today's headline counts plus each agent's health (silent / auditd off). */
export async function summary() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const today = { at: { [Op.gte]: start } };
  const count = (where) => ServerLog.count({ where: { ...today, ...where } });
  const [loginsToday, failedLoginsToday, sudoToday, deletesToday, tamperToday, agents] = await Promise.all([
    count({ type: 'login_ok' }),
    count({ type: 'login_fail' }),
    count({ type: { [Op.in]: ['sudo', 'su'] } }),
    count({ type: 'file_delete' }),
    count({ type: { [Op.in]: ['audit_tamper', 'agent_stop'] } }),
    ServerAgent.findAll({ order: [['host', 'ASC']] }),
  ]);
  const now = Date.now();
  return {
    loginsToday,
    failedLoginsToday,
    sudoToday,
    deletesToday,
    tamperToday,
    configured: !!config.serverAgent.key,
    agents: agents.map((a) => ({
      host: a.host,
      agentVersion: a.agentVersion,
      lastSeenAt: a.lastSeenAt,
      lastIp: a.lastIp,
      auditd: a.auditd,
      startedAt: a.startedAt,
      silent: now - new Date(a.lastSeenAt).getTime() > config.serverAgent.staleMs,
    })),
  };
}

/** Distinct hosts, for the filter. */
export async function hosts() {
  const rows = await ServerAgent.findAll({ attributes: ['host'], order: [['host', 'ASC']] });
  return rows.map((r) => r.host);
}
