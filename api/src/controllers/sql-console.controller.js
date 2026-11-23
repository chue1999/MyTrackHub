import { engine, listConnections } from '../services/sql-console.service.js';

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
  res.json(await engine(conn).runQuery(db, sql));
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
