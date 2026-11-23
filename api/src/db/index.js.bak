import pg from 'pg';
import { Sequelize } from 'sequelize';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export const sequelize = new Sequelize(config.db.name, config.db.user, config.db.password, {
  host: config.db.host,
  port: config.db.port,
  dialect: 'postgres',
  logging: config.db.logging ? (sql) => logger.debug({ sql }, 'sql') : false,
  pool: { max: 10, idle: 10_000 },
});

/** Creates the database if it doesn't exist yet, so the first start "just works". */
export async function ensureDatabase() {
  const client = new pg.Client({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: 'postgres',
  });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [config.db.name]);
    if (rowCount === 0) {
      // Database names can't be parameterised; the name comes from our own config.
      await client.query(`CREATE DATABASE "${config.db.name.replace(/"/g, '""')}"`);
      logger.info(`Created database ${config.db.name}`);
    }
  } finally {
    await client.end();
  }
}

/** Connects and creates/updates tables according to DB_SYNC. */
export async function connectDatabase() {
  await ensureDatabase();
  await sequelize.authenticate();
  if (config.db.sync !== 'none') {
    await sequelize.sync({ alter: config.db.sync === 'alter', force: config.db.sync === 'force' });
  }
}
