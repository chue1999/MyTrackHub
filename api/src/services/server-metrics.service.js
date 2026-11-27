import os from 'node:os';
import { Op, fn, col } from 'sequelize';
import { config } from '../config/index.js';
import { ServerMetric } from '../models/index.js';
import { logger } from '../utils/logger.js';
import { record as recordServerLog } from './server-log.service.js';
import { status } from './server-status.service.js';

const DAY = 86_400_000;

/** Takes one capacity reading now and stores it. */
export async function takeReading() {
  const s = await status();
  const m = s.memory;
  const disk = s.disks?.find((d) => d.mount === '/') ?? s.disks?.[0] ?? null;
  const sum = (key) => (s.network ? s.network.reduce((t, n) => t + (n[key] ?? 0), 0) : null);
  return ServerMetric.create({
    host: s.system?.hostname ?? os.hostname(),
    at: new Date(s.at),
    cpu: round(s.cpu?.usage),
    load1: round(s.load?.avg?.[0], 2),
    load5: round(s.load?.avg?.[1], 2),
    load15: round(s.load?.avg?.[2], 2),
    cores: s.load?.cores ?? null,
    memTotal: m?.total ?? null,
    memUsed: m?.used ?? null,
    memAvailable: m?.available ?? null,
    memCache: m ? (m.cached ?? 0) + (m.buffers ?? 0) : null,
    swapUsed: m?.swapUsed ?? null,
    diskMount: disk?.mount ?? null,
    diskSize: disk?.size ?? null,
    diskUsed: disk?.used ?? null,
    diskPercent: round(disk?.percent),
    netRx: round(sum('rxBytes')),
    netTx: round(sum('txBytes')),
    apiRss: s.api?.rss ?? null,
    dbLatencyMs: s.database?.latencyMs ?? null,
  });
}

/** Removes readings older than the keep period; the clean-up itself is logged. */
export async function purgeOld() {
  const cutoff = new Date(Date.now() - config.serverMetrics.keepDays * DAY);
  const deleted = await ServerMetric.destroy({ where: { at: { [Op.lt]: cutoff } } });
  if (deleted) {
    await recordServerLog({
      host: os.hostname(),
      eventKey: `metrics-purge-${cutoff.toISOString().slice(0, 13)}`,
      at: new Date(),
      type: 'maintenance',
      user: 'auto',
      summary: `Deleted ${deleted} capacity readings older than ${config.serverMetrics.keepDays} days`,
      detail: { deleted, olderThan: cutoff.toISOString(), keepDays: config.serverMetrics.keepDays },
    }).catch((err) => logger.warn({ err: err.message }, 'Could not log the capacity clean-up'));
  }
  return deleted;
}

/** History for the Capacity page: a page of readings (newest first) + averages and peaks. */
export async function history({ from, to, page = 1, pageSize = 100 }) {
  const where = { at: { [Op.gte]: new Date(from ?? Date.now() - DAY), [Op.lte]: new Date(to ?? Date.now()) } };
  const [{ rows, count }, agg] = await Promise.all([
    ServerMetric.findAndCountAll({
      where,
      order: [['at', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    ServerMetric.findOne({
      where,
      raw: true,
      attributes: [
        [fn('AVG', col('cpu')), 'cpuAvg'],
        [fn('MAX', col('cpu')), 'cpuMax'],
        [fn('AVG', col('load1')), 'loadAvg'],
        [fn('MAX', col('load1')), 'loadMax'],
        [fn('MAX', col('mem_used')), 'memUsedMax'],
        [fn('MIN', col('mem_available')), 'memAvailableMin'],
        [fn('MAX', col('disk_percent')), 'diskMax'],
        [fn('MAX', col('db_latency_ms')), 'dbMax'],
        [fn('COUNT', col('id')), 'readings'],
      ],
    }),
  ]);
  const num = (v) => (v === null || v === undefined ? null : Number(v));
  return {
    rows,
    total: count,
    page,
    pageSize,
    intervalMinutes: config.serverMetrics.intervalMs / 60_000,
    keepDays: config.serverMetrics.keepDays,
    summary: Object.fromEntries(Object.entries(agg ?? {}).map(([k, v]) => [k, num(v)])),
  };
}

function round(v, digits = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
