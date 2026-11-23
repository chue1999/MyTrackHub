import pg from 'pg';
import { config } from '../config/index.js';
import { HttpError } from '../utils/http-error.js';
import { cell } from './sql-console.mssql.js';

/**
 * PostgreSQL engine of the admin SQL console (see sql-console.service.js).
 * Uses the API's own database (DB_*) and nothing else on that server.
 */
const cfg = config.db;
const { maxRows, timeoutMs } = config.sqlConsole;
const pools = new Map();
const typeNames = new Map(); // oid → type name, filled on first use

function poolFor(db) {
  if (!pools.has(db)) {
    const pool = new pg.Pool({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: db,
      max: 3,
      idleTimeoutMillis: 60000,
      connectionTimeoutMillis: 15000,
      statement_timeout: timeoutMs,
      application_name: 'MyTPlus Admin SQL',
    });
    pool.on('error', () => {}); // an idle client dropping must not crash the API
    pools.set(db, pool);
  }
  return pools.get(db);
}

async function query(db, text, values) {
  try {
    return await poolFor(db).query(text, values);
  } catch (err) {
    throw err.code
      ? HttpError.badRequest(err.message)
      : new HttpError(502, `Cannot connect to PostgreSQL: ${err.message}`);
  }
}

/** Only the API's own database (DB_NAME) is open here; other databases on the server stay hidden. */
async function checkDatabase(db) {
  if (db !== cfg.name) throw HttpError.badRequest(`Only the ${cfg.name} database can be used here`);
  return db;
}

export async function status() {
  const r = await query(cfg.name, 'SELECT version() AS version, current_user AS login');
  return {
    enabled: true,
    server: `${cfg.host}:${cfg.port}`,
    login: r.rows[0].login,
    version: String(r.rows[0].version).split(',')[0],
    defaultDatabase: cfg.name,
    maxRows,
  };
}

export async function listDatabases() {
  return [{ name: cfg.name, system: false }];
}

const HIDDEN_SCHEMAS = `('pg_catalog', 'information_schema')`;

/** Tables (with estimated row counts), views, procedures and functions. */
export async function listObjects(db) {
  await checkDatabase(db);
  const r = await query(
    db,
    `SELECT n.nspname AS schema, c.relname AS name, c.relkind::text AS kind,
            CASE WHEN c.relkind IN ('r', 'p') AND c.reltuples >= 0 THEN c.reltuples::bigint END AS rows,
            CASE WHEN c.relkind IN ('r', 'p') AND c.reltuples < 0 THEN true END AS never_counted
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('r', 'p', 'v', 'm') AND n.nspname NOT IN ${HIDDEN_SCHEMAS} AND n.nspname NOT LIKE 'pg_toast%'
     UNION ALL
     SELECT DISTINCT n.nspname, p.proname, CASE WHEN p.prokind = 'p' THEN 'P' ELSE 'F' END, NULL::bigint, NULL::boolean
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname NOT IN ${HIDDEN_SCHEMAS} AND n.nspname NOT LIKE 'pg_toast%' AND p.prokind IN ('f', 'p')
     ORDER BY 1, 2`,
  );
  const objects = r.rows.map((o) => ({
    schema: o.schema,
    name: o.name,
    kind: { r: 'table', p: 'table', v: 'view', m: 'view', P: 'procedure' }[o.kind] ?? 'function',
    rows: o.rows === null ? null : Number(o.rows),
    neverCounted: !!o.never_counted,
  }));
  // Tables PostgreSQL hasn't counted yet (new or small): count them exactly, a few at a time.
  const uncounted = objects.filter((o) => o.neverCounted).slice(0, 50);
  await Promise.all(
    uncounted.map(async (o) => {
      try {
        const c = await query(db, `SELECT COUNT(*)::bigint AS n FROM ${quote(o.schema)}.${quote(o.name)}`);
        o.rows = Number(c.rows[0].n);
      } catch {
        // no permission: leave the count empty
      }
    }),
  );
  return objects.map(({ neverCounted: _n, ...o }) => o);
}

const quote = (name) => `"${String(name).replace(/"/g, '""')}"`;

/** Columns of one table or view, with primary key flags. */
export async function listColumns(db, schema, name) {
  await checkDatabase(db);
  const r = await query(
    db,
    `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, NOT a.attnotnull AS nullable,
            COALESCE(a.attnum = ANY (i.indkey), false) AS is_key
     FROM pg_attribute a
     JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     LEFT JOIN pg_index i ON i.indrelid = c.oid AND i.indisprimary
     WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum`,
    [schema, name],
  );
  return r.rows.map((c) => ({ name: c.name, type: c.type, nullable: c.nullable, isKey: c.is_key }));
}

async function loadTypeNames(client) {
  if (typeNames.size) return;
  const r = await client.query('SELECT oid, typname FROM pg_type');
  for (const t of r.rows) typeNames.set(Number(t.oid), t.typname);
}

/** Line number (1-based) of a character position in the SQL text. */
const lineAt = (text, pos) => text.slice(0, Math.max(0, pos - 1)).split('\n').length;

/**
 * Runs SQL text (one or more statements) in a database. PostgreSQL runs
 * several statements sent together as one transaction: if one fails, none
 * of them is kept.
 */
export async function runQuery(db, text) {
  await checkDatabase(db);
  const out = { resultSets: [], messages: [], error: null, durationMs: 0, maxRows };
  let client;
  try {
    client = await poolFor(db).connect();
  } catch (err) {
    throw new HttpError(502, `Cannot connect to PostgreSQL: ${err.message}`);
  }
  const onNotice = (n) => out.messages.push(n.message);
  client.on('notice', onNotice);
  const started = Date.now();
  try {
    await loadTypeNames(client);
    const res = await client.query({ text, rowMode: 'array' });
    for (const r of Array.isArray(res) ? res : [res]) {
      if (r.fields?.length) {
        out.resultSets.push({
          columns: r.fields.map((f) => ({ name: f.name, type: typeNames.get(f.dataTypeID) ?? '' })),
          rows: r.rows.slice(0, maxRows).map((row) => row.map(cell)),
          total: r.rows.length,
          truncated: r.rows.length > maxRows,
        });
      }
      if (r.command && r.rowCount !== null) {
        const n = r.rowCount;
        out.messages.push(`${r.command}: ${n} row${n === 1 ? '' : 's'}${r.command === 'SELECT' ? '' : ' affected'}`);
      } else if (r.command) {
        out.messages.push(r.command);
      }
    }
  } catch (err) {
    out.error = {
      message: err.message,
      number: err.code,
      line: err.position ? lineAt(text, Number(err.position)) : undefined,
    };
  } finally {
    client.off('notice', onNotice);
    client.release();
  }
  out.durationMs = Date.now() - started;
  return out;
}

// Backups are a SQL Server feature here (production). PostgreSQL (dev) uses pg_dump.
const noBackup = () => {
  throw HttpError.badRequest('Back up is available on SQL Server (production). For PostgreSQL use pg_dump.');
};
export const backupDatabase = noBackup;
export async function listBackups() {
  return [];
}
