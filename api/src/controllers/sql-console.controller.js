import { ipOf, logCcare } from '../services/ccare-log.service.js';
import { engine, listConnections } from '../services/sql-console.service.js';

/** Statements that remove data or tables; these are written to the audit log. */
const DELETES = /\b(delete|truncate|drop)\b/i;

/** GET /sql/connections */
export async function connections(_req, res) {
  res.json(listConnections());
}

/** GET /sql/status?conn= */
export async function status(req, res) {
  res.json(await engine(req.validatedQuery.conn).status());
}

/** GET /sql/databases?conn= */
export async function databases(req, res) {
  res.json(await engine(req.validatedQuery.conn).listDatabases());
}

/** GET /sql/objects?conn=&db= */
export async function objects(req, res) {
  const { conn, db } = req.validatedQuery;
  res.json(await engine(conn).listObjects(db));
}

/** GET /sql/columns?conn=&db=&schema=&name= */
export async function columns(req, res) {
  const { conn, db, schema, name } = req.validatedQuery;
  res.json(await engine(conn).listColumns(db, schema, name));
}

/** POST /sql/query — every query is written to the log with who ran it. */
export async function query(req, res) {
  const { conn, db, sql } = req.body;
  req.log.info({ admin: req.me.username, conn, db, sql: sql.slice(0, 4000) }, 'SQL console query');
  if (!DELETES.test(sql)) return res.json(await engine(conn).runQuery(db, sql));

  const record = (success, extra) =>
    logCcare({
      name: req.me.username,
      action: 'sql_delete',
      success,
      actor: req.me.username,
      ip: ipOf(req),
      detail: { deletedBy: req.me.username, db: db ?? null, sql: sql.slice(0, 4000), ...extra },
    });
  try {
    const result = await engine(conn).runQuery(db, sql);
    // Query errors come back in the result (not thrown).
    const error = result?.error ? String(result.error?.message ?? result.error).slice(0, 500) : null;
    await record(!error, error ? { error } : {});
    res.json(result);
  } catch (err) {
    await record(false, { error: String(err?.message ?? err).slice(0, 500) });
    throw err;
  }
}

/** GET /sql/backups?db= — backup history of the database. */
export async function backups(req, res) {
  const { conn, db } = req.validatedQuery;
  res.json(await engine(conn).listBackups(db));
}

/** POST /sql/backup — full copy-only backup (.bak) on the SQL Server machine. */
export async function backup(req, res) {
  const { conn, db } = req.body;
  req.log.info({ admin: req.me.username, conn, db }, 'SQL console backup');
  res.status(201).json(await engine(conn).backupDatabase(db));
}
