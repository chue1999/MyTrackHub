import pg from 'pg';
import { DataTypes, Sequelize } from 'sequelize';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/** postgres (dev) or mssql (SQL Server, prod), from DB_DIALECT. */
export const dialect = config.db.dialect;
export const isMssql = dialect === 'mssql';

export const sequelize = new Sequelize(config.db.name, config.db.user, config.db.password, {
  host: config.db.host,
  port: config.db.port,
  dialect,
  logging: config.db.logging ? (sql) => logger.debug({ sql }, 'sql') : false,
  pool: { max: 10, idle: 10_000 },
  ...(isMssql && {
    dialectOptions: {
      options: {
        encrypt: config.db.encrypt,
        trustServerCertificate: config.db.trustServerCertificate,
        appName: 'MyTPlus Tracking API',
        requestTimeout: 60_000,
      },
    },
  }),
});

/**
 * A JSON value, read and written as a normal object.
 * PostgreSQL: a JSONB column. SQL Server has no JSON type, so there it is
 * NVARCHAR(MAX) text (query it with JSON_VALUE / OPENJSON).
 *
 * @param {string} field attribute name (for the getter/setter)
 * @param {object} [extra] more column options (allowNull, defaultValue…)
 */
export function jsonColumn(field, extra = {}) {
  if (!isMssql) return { type: DataTypes.JSONB, ...extra };
  const { defaultValue, ...rest } = extra;
  return {
    type: DataTypes.TEXT,
    ...(defaultValue !== undefined && { defaultValue: JSON.stringify(defaultValue) }),
    ...rest,
    get() {
      const raw = this.getDataValue(field);
      if (raw === null || raw === undefined) return raw;
      if (typeof raw !== 'string') return raw;
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    },
    set(value) {
      this.setDataValue(field, value === null || value === undefined ? value : JSON.stringify(value));
    },
  };
}

/** A value from a fixed list: ENUM on PostgreSQL, checked text on SQL Server (no ENUM type there). */
export const oneOf = (values, extra = {}) =>
  isMssql
    ? { type: DataTypes.STRING(Math.max(...values.map((v) => v.length))), validate: { isIn: [values] }, ...extra }
    : { type: DataTypes.ENUM(...values), ...extra };

/** PostgreSQL: creates the database if it doesn't exist yet, so the first start "just works". */
async function ensurePostgresDatabase() {
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

/**
 * SQL Server: adds columns that exist in a model but not yet in its table.
 * (Sequelize's own `alter` breaks on SQL Server, e.g. on UNIQUE columns, so
 * there we only ever add: nothing is changed or dropped.)
 */
async function addMissingColumns() {
  const qi = sequelize.getQueryInterface();
  for (const model of Object.values(sequelize.models)) {
    const table = model.getTableName();
    const existing = await qi.describeTable(table);
    for (const attr of Object.values(model.getAttributes())) {
      if (existing[attr.field]) continue;
      const { get: _g, set: _s, ...column } = attr;
      // A new NOT NULL column without a default can't be added to a table that has rows.
      if (column.allowNull === false && column.defaultValue === undefined) column.allowNull = true;
      await qi.addColumn(table, attr.field, column);
      logger.info(`Added column ${table}.${attr.field}`);
    }
  }
}

/**
 * Connects and prepares the tables according to DB_SYNC:
 *   alter → create missing tables and update columns (default)
 *   force → drop and recreate every table (all data is lost!)
 *   none  → touch nothing
 */
export async function connectDatabase() {
  if (!isMssql) await ensurePostgresDatabase();
  await sequelize.authenticate();
  if (config.db.sync === 'none') return;
  const force = config.db.sync === 'force';
  if (!isMssql) {
    await sequelize.sync({ alter: config.db.sync === 'alter', force });
    return;
  }
  await sequelize.sync({ force });
  if (config.db.sync === 'alter') await addMissingColumns();
}
