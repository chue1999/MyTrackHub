import sql from 'mssql';
import { config } from '../config/index.js';
import { HttpError } from '../utils/http-error.js';

/**
 * SQL Server engine of the admin SQL console (see sql-console.service.js).
 * Uses the API's own database login (DB_*). One shared connection pool.
 */
const cfg = config.db;
const { maxRows, timeoutMs } = config.sqlConsole;
let poolPromise = null;

function getPool() {
  poolPromise ??= new sql.ConnectionPool({
    server: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.name,
    requestTimeout: timeoutMs,
    connectionTimeout: 15000,
    pool: { max: 5, min: 0, idleTimeoutMillis: 60000 },
    options: { encrypt: cfg.encrypt, trustServerCertificate: cfg.trustServerCertificate, appName: 'MyTPlus Admin' },
  })
    .connect()
    .catch((err) => {
      poolPromise = null; // try again next time
      throw new HttpError(502, `Cannot connect to SQL Server: ${err.message}`);
    });
  return poolPromise;
}

/** [name] with ] escaped, for database/schema/table names. */
const quote = (name) => `[${String(name).replace(/]/g, ']]')}]`;

/** Only the API's own database (DB_NAME) is open here; other databases on the server stay hidden. */
async function checkDatabase(_pool, db) {
  if (db !== cfg.name) throw HttpError.badRequest(`Only the ${cfg.name} database can be used here`);
  return quote(cfg.name);
}

/** Turns driver errors into a readable 400 (SQL mistakes are the user's to fix). */
function sqlError(err) {
  if (err instanceof HttpError) return err;
  return HttpError.badRequest(err.originalError?.info?.message || err.message);
}

export async function status() {
  const pool = await getPool();
  const r = await pool
    .request()
    .query('SELECT @@SERVERNAME AS serverName, @@VERSION AS version, SUSER_SNAME() AS login');
  const row = r.recordset[0];
  return {
    enabled: true,
    server: row.serverName || cfg.host,
    login: row.login,
    version: String(row.version).split('\n')[0].trim(),
    defaultDatabase: cfg.name,
    maxRows,
  };
}

export async function listDatabases() {
  return [{ name: cfg.name, system: false }];
}

/** Tables (with row counts), views, procedures and functions in one database. */
export async function listObjects(db) {
  const pool = await getPool();
  const qdb = await checkDatabase(pool, db);
  try {
    const r = await pool.request().query(`
      SELECT s.name AS [schema], o.name, RTRIM(o.type) AS type,
             CASE WHEN o.type = 'U' THEN (SELECT SUM(p.rows) FROM ${qdb}.sys.partitions p
                                         WHERE p.object_id = o.object_id AND p.index_id IN (0, 1)) END AS [rows]
      FROM ${qdb}.sys.objects o
      JOIN ${qdb}.sys.schemas s ON s.schema_id = o.schema_id
      WHERE o.type IN ('U', 'V', 'P', 'FN', 'IF', 'TF') AND o.is_ms_shipped = 0
      ORDER BY s.name, o.name`);
    return r.recordset.map((o) => ({
      schema: o.schema,
      name: o.name,
      kind: { U: 'table', V: 'view', P: 'procedure' }[o.type] ?? 'function',
      rows: o.rows === null || o.rows === undefined ? null : Number(o.rows),
    }));
  } catch (err) {
    throw sqlError(err);
  }
}

/** Columns of one table or view, with primary key flags. */
export async function listColumns(db, schema, name) {
  const pool = await getPool();
  const qdb = await checkDatabase(pool, db);
  try {
    const r = await pool.request().input('schema', sql.NVarChar, schema).input('name', sql.NVarChar, name).query(`
        SELECT c.COLUMN_NAME AS name, c.DATA_TYPE AS type, c.CHARACTER_MAXIMUM_LENGTH AS maxLength,
               c.NUMERIC_PRECISION AS [precision], c.NUMERIC_SCALE AS scale, c.IS_NULLABLE AS nullable,
               CASE WHEN k.COLUMN_NAME IS NULL THEN 0 ELSE 1 END AS isKey
        FROM ${qdb}.INFORMATION_SCHEMA.COLUMNS c
        LEFT JOIN (
          SELECT ku.COLUMN_NAME FROM ${qdb}.INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
          JOIN ${qdb}.INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
            ON ku.CONSTRAINT_NAME = tc.CONSTRAINT_NAME AND ku.TABLE_SCHEMA = tc.TABLE_SCHEMA
          WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_SCHEMA = @schema AND tc.TABLE_NAME = @name
        ) k ON k.COLUMN_NAME = c.COLUMN_NAME
        WHERE c.TABLE_SCHEMA = @schema AND c.TABLE_NAME = @name
        ORDER BY c.ORDINAL_POSITION`);
    return r.recordset.map((c) => ({
      name: c.name,
      type: typeLabel(c),
      nullable: c.nullable === 'YES',
      isKey: !!c.isKey,
    }));
  } catch (err) {
    throw sqlError(err);
  }
}

function typeLabel(c) {
  if (c.maxLength) return `${c.type}(${c.maxLength === -1 ? 'max' : c.maxLength})`;
  if (['decimal', 'numeric'].includes(c.type)) return `${c.type}(${c.precision},${c.scale})`;
  return c.type;
}

/** JSON-friendly cell values. Shared with the PostgreSQL engine. */
export function cell(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) {
    const hex = v.subarray(0, 64).toString('hex').toUpperCase();
    return `0x${hex}${v.length > 64 ? `… (${v.length} bytes)` : ''}`;
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

function columnType(c) {
  const t = c.type?.declaration ?? '';
  return c.length && c.length < 65535 && /char|binary/.test(t) ? `${t}(${c.length})` : t;
}

/** Runs one batch, streaming rows so a huge result only keeps the first `maxRows`. */
function runBatch(pool, text, out) {
  return new Promise((resolve) => {
    const req = pool.request();
    req.stream = true;
    req.arrayRowMode = true;
    let current = null;
    req.on('recordset', (columns) => {
      current = {
        columns: columns.map((c) => ({ name: c.name, type: columnType(c) })),
        rows: [],
        total: 0,
      };
      out.resultSets.push(current);
    });
    req.on('row', (row) => {
      if (!current) return;
      current.total += 1;
      if (current.rows.length < maxRows) current.rows.push(row.map(cell));
    });
    req.on('rowsaffected', (n) => out.messages.push(`(${n} row${n === 1 ? '' : 's'} affected)`));
    // Skip the note from our own USE line.
    req.on('info', (m) => {
      if (!/^Changed database context to/.test(m.message)) out.messages.push(m.message);
    });
    req.on('error', (err) => {
      if (out.error) return;
      const info = err.originalError?.info ?? err.precedingErrors?.[0]?.originalError?.info ?? {};
      out.error = { message: info.message || err.message, number: info.number ?? err.number, line: info.lineNumber };
    });
    req.on('done', () => resolve());
    req.batch(text);
  });
}

/**
 * Runs SQL text in a database. "GO" lines split it into batches, like in
 * SQL Server Management Studio. Stops at the first batch that fails.
 */
export async function runQuery(db, text) {
  const pool = await getPool();
  const qdb = await checkDatabase(pool, db);
  const batches = String(text)
    .split(/^\s*GO\s*;?\s*$/gim)
    .filter((b) => b.trim());
  const out = { resultSets: [], messages: [], error: null, durationMs: 0, maxRows };
  const started = Date.now();
  for (const b of batches) {
    // Same line as the user's SQL, so error line numbers still match the editor.
    await runBatch(pool, `USE ${qdb}; ${b}`, out);
    if (out.error) break;
  }
  out.durationMs = Date.now() - started;
  for (const rs of out.resultSets) rs.truncated = rs.total > rs.rows.length;
  return out;
}
