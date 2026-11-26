/**
 * Creates the tables (and indexes) that do not exist yet — nothing else.
 * Existing tables and their data are never changed or dropped. Useful when the
 * server runs with DB_SYNC=none, after an update that adds new tables:
 *
 *   NODE_ENV=production npm run db:create-tables
 */
import { sequelize } from '../db/index.js';
import '../models/index.js';
import { logger } from '../utils/logger.js';

try {
  await sequelize.authenticate();
  const qi = sequelize.getQueryInterface();
  const before = new Set((await qi.showAllTables()).map((t) => (typeof t === 'string' ? t : t.tableName)));
  for (const model of Object.values(sequelize.models)) {
    const table = model.getTableName();
    const name = typeof table === 'string' ? table : table.tableName;
    if (before.has(name)) continue;
    await model.sync(); // CREATE TABLE … + its indexes
    logger.info(`Created table ${name}`);
  }
  logger.info('Done: every table exists.');
  await sequelize.close();
  process.exit(0);
} catch (err) {
  logger.error({ err }, 'Could not create the tables');
  process.exit(1);
}
