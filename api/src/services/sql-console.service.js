import { config } from '../config/index.js';
import { HttpError } from '../utils/http-error.js';
import * as mssql from './sql-console.mssql.js';
import * as postgres from './sql-console.postgres.js';

/**
 * SQL console for the admin website (administrators only, see the route):
 * browse tables and run any SQL on the API's own database, whichever it is:
 * PostgreSQL in development, SQL Server in production (DB_DIALECT).
 */
export const CONNECTIONS = ['postgres', 'mssql'];
const LABELS = { postgres: 'PostgreSQL', mssql: 'SQL Server' };

/** Only the database this API is running on. */
export function listConnections() {
  const id = config.db.dialect;
  return [{ id, label: LABELS[id], host: `${config.db.host}:${config.db.port}`, enabled: true }];
}

/** The engine for a connection id. Every engine has the same functions. */
export function engine(conn = config.db.dialect) {
  if (conn !== config.db.dialect) {
    throw HttpError.badRequest(`This server uses ${LABELS[config.db.dialect]}, not ${LABELS[conn] ?? conn}.`);
  }
  return conn === 'mssql' ? mssql : postgres;
}
