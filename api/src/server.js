import { createApp } from './app.js';
import { config } from './config/index.js';
import { connectDatabase, sequelize } from './db/index.js';
import { startRetentionJob } from './jobs/retention.job.js';
import './models/index.js';
import { ensureFirstAdmin } from './services/auth.service.js';
import { logger } from './utils/logger.js';

/** Entry point: database → first admin → background jobs → HTTP server. */
async function start() {
  await connectDatabase();
  await ensureFirstAdmin();
  const stopRetention = startRetentionJob();

  const server = createApp().listen(config.port, () => {
    logger.info(`MyTPlus tracking API listening on http://localhost:${config.port} (${config.env})`);
  });

  // Graceful shutdown: stop accepting requests, finish the current ones, close the DB.
  let closing = false;
  const shutdown = (signal) => {
    if (closing) return;
    closing = true;
    logger.info(`${signal} received, shutting down`);
    stopRetention();
    server.close(async () => {
      await sequelize.close().catch(() => {});
      process.exit(0);
    });
    // Live-stream connections never end on their own.
    server.closeAllConnections?.();
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (err) => logger.error({ err }, 'Unhandled promise rejection'));

start().catch((err) => {
  logger.fatal({ err }, `Failed to start: ${err.message}`);
  process.exit(1);
});
