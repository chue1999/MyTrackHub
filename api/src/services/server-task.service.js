import { Op } from 'sequelize';
import { config } from '../config/index.js';
import { ServerAgent, ServerTask } from '../models/index.js';
import { HttpError } from '../utils/http-error.js';
import { record } from './server-log.service.js';

/**
 * Cache clearing on a server. The web only *asks* (one of a fixed list of
 * actions); the agent on that server picks the request up, runs its own fixed
 * command as root and reports back. Every request and result is written to the
 * server log, so it is always visible who cleared what, and how much was freed.
 */
export const ACTIONS = {
  page_cache: {
    title: 'Memory page cache',
    description:
      'Frees RAM that Linux uses to cache files. Everything is written to disk first (sync), so no data is touched; the server is only a little slower for a few minutes while the cache refills.',
    risk: 'low',
  },
  journal: {
    title: 'System journal (old logs)',
    description:
      'Removes system logs (journald) older than the keep period (7 days). No app data or database is touched; Server logs already sent here are kept.',
    risk: 'medium',
  },
  apt: {
    title: 'APT package cache',
    description:
      'Deletes only downloaded .deb installer files (apt-get clean). Installed software and data are not touched.',
    risk: 'low',
  },
  tmp: {
    title: 'Old temporary files',
    description:
      'Deletes only files in /tmp neither opened nor changed for 7 days. Never /var/tmp, never system folders, never a file any program has open.',
    risk: 'medium',
  },
  pm2_logs: {
    title: 'PM2 / API log files',
    description:
      'Empties only the MyTrackHub PM2 log files (mytrackhub-*.log). Other apps (ezapi, topup-api…) are not touched; the files stay, only their text is cleared.',
    risk: 'medium',
  },
  nginx_cache: {
    title: 'Nginx cache',
    description: 'Empties the nginx proxy cache folder (only if the agent has NGINX_CACHE_DIR set).',
    risk: 'low',
  },
};

// A running task the agent never reported back on is shown as failed after this.
const RUN_TIMEOUT_MS = 15 * 60_000;

const label = (action) => ACTIONS[action]?.title ?? action;

/** The Clear cache page: agents with their cache sizes, the actions, and recent tasks. */
export async function overview() {
  await expireStuck();
  const [agents, tasks] = await Promise.all([
    ServerAgent.findAll({ order: [['host', 'ASC']] }),
    ServerTask.findAll({ order: [['requestedAt', 'DESC']], limit: 50 }),
  ]);
  const now = Date.now();
  return {
    configured: !!config.serverAgent.key,
    actions: Object.entries(ACTIONS).map(([key, a]) => ({ key, ...a })),
    agents: agents.map((a) => ({
      host: a.host,
      lastSeenAt: a.lastSeenAt,
      silent: now - new Date(a.lastSeenAt).getTime() > config.serverAgent.staleMs,
      caches: a.caches ?? {},
      cachesAt: a.cachesAt,
    })),
    tasks,
  };
}

/** Recent tasks only (the page polls this while something is running). */
export async function recentTasks() {
  await expireStuck();
  return ServerTask.findAll({ order: [['requestedAt', 'DESC']], limit: 50 });
}

/** A web user asks for one cache to be cleared on one server. */
export async function request({ host, action }, me, ip) {
  const agent = await ServerAgent.findByPk(host);
  if (!agent) throw HttpError.notFound('No agent is installed on this server.');
  const size = agent.caches?.[action];
  if (size === null || size === undefined) throw HttpError.badRequest('This cache is not set up on that server.');
  const open = await ServerTask.count({ where: { host, action, status: { [Op.in]: ['pending', 'running'] } } });
  if (open) throw HttpError.badRequest('This is already waiting or running on that server.');

  const task = await ServerTask.create({ host, action, requestedBy: me.username, requestedIp: ip ?? null });
  await record({
    host,
    eventKey: `task-${task.id}-req`,
    at: new Date(),
    type: 'maintenance',
    user: me.username,
    sourceIp: ip ?? null,
    summary: `Asked to clear: ${label(action)}`,
    detail: { taskId: Number(task.id), action, requestedBy: me.username, via: 'web' },
  });
  return task;
}

/** The agent picks up what is waiting for its server (marks it running). */
export async function claim(host) {
  const pending = await ServerTask.findAll({
    where: { host, status: 'pending' },
    order: [['requestedAt', 'ASC']],
    limit: 5,
  });
  const now = new Date();
  for (const t of pending) await t.update({ status: 'running', startedAt: now });
  return pending.map((t) => ({ id: Number(t.id), action: t.action }));
}

/** The agent reports how a task went. */
export async function finish(id, { host, ok, freedBytes, output }) {
  const task = await ServerTask.findByPk(Number(id));
  if (!task || task.host !== host) throw HttpError.notFound('Task not found.');
  if (task.status !== 'running') return task;
  await task.update({
    status: ok ? 'done' : 'failed',
    finishedAt: new Date(),
    freedBytes: freedBytes ?? null,
    output: (output ?? '').slice(0, 20000),
  });
  await record({
    host,
    eventKey: `task-${task.id}-end`,
    at: new Date(),
    type: 'maintenance',
    user: task.requestedBy,
    runAs: 'root',
    success: ok,
    summary: ok
      ? `Cleared: ${label(task.action)}${freedBytes ? ` (freed ${formatBytes(freedBytes)})` : ''}`
      : `Clear failed: ${label(task.action)}`,
    detail: {
      taskId: Number(task.id),
      action: task.action,
      freedBytes: freedBytes ?? null,
      output: (output ?? '').slice(0, 2000),
    },
  });
  return task;
}

/** Running tasks the agent never finished (crash, reboot) become failed. */
async function expireStuck() {
  await ServerTask.update(
    { status: 'failed', finishedAt: new Date(), output: 'The agent did not report back (timed out).' },
    { where: { status: 'running', startedAt: { [Op.lt]: new Date(Date.now() - RUN_TIMEOUT_MS) } } },
  );
}

function formatBytes(n) {
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = Number(n);
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i ? 1 : 0)} ${u[i]}`;
}
