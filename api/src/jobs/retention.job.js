import { runCleanup } from '../services/retention.service.js';
import { logger } from '../utils/logger.js';

const FIRST_RUN_DELAY_MS = 10_000;
const INTERVAL_MS = 60 * 60 * 1000; // hourly

/** Deletes old logs every hour (when "Auto delete old logs" is on). Returns a stop function. */
export function startRetentionJob() {
  const tick = () => runCleanup().catch((err) => logger.error({ err }, 'Retention job failed'));
  const first = setTimeout(tick, FIRST_RUN_DELAY_MS);
  const every = setInterval(tick, INTERVAL_MS);
  first.unref();
  every.unref();
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
