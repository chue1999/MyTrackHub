import { config } from '../config/index.js';
import { purgeOld, takeReading } from '../services/server-metrics.service.js';
import { logger } from '../utils/logger.js';

const FIRST_RUN_DELAY_MS = 20_000;
const PURGE_EVERY_MS = 6 * 60 * 60 * 1000;

/** Records the server's capacity every SERVER_METRICS_INTERVAL_MINUTES. Returns a stop function. */
export function startServerMetricsJob() {
  const { intervalMs } = config.serverMetrics;
  if (!intervalMs) return () => {};
  const tick = () => takeReading().catch((err) => logger.warn({ err: err.message }, 'Capacity reading failed'));
  const purge = () => purgeOld().catch((err) => logger.warn({ err: err.message }, 'Capacity clean-up failed'));
  const first = setTimeout(() => {
    tick();
    purge();
  }, FIRST_RUN_DELAY_MS);
  const every = setInterval(tick, intervalMs);
  const cleanup = setInterval(purge, PURGE_EVERY_MS);
  for (const t of [first, every, cleanup]) t.unref();
  return () => {
    clearTimeout(first);
    clearInterval(every);
    clearInterval(cleanup);
  };
}
