import { isMssql } from '../db/index.js';

/**
 * SQL building blocks for the raw statistics queries, written once and turned
 * into PostgreSQL (dev) or T-SQL (SQL Server, prod) depending on DB_DIALECT.
 * Only ever pass fixed column names / paths from our own code, never user input.
 */

/** `col` is true / false (PostgreSQL boolean vs SQL Server bit). */
export const isTrue = (col) => (isMssql ? `${col} = 1` : `${col} IS TRUE`);
export const isFalse = (col) => (isMssql ? `${col} = 0` : `${col} IS FALSE`);

/** How many rows match a condition (0 when none). */
// (Cast to int: PostgreSQL's SUM/COUNT are bigint, which node-postgres returns as text.)
export const countIf = (cond) => `CAST(COALESCE(SUM(CASE WHEN ${cond} THEN 1 ELSE 0 END), 0) AS int)`;

/** Sum of an expression over the rows matching a condition (0 when none). */
export const sumIf = (cond, expr) => `COALESCE(SUM(CASE WHEN ${cond} THEN ${expr} END), 0)`;

/** "SELECT TOP (n) …" on SQL Server … */
export const top = (n) => (isMssql ? `TOP (${n})` : '');
/** … "… LIMIT n" on PostgreSQL. Use both in the same query. */
export const limit = (n) => (isMssql ? '' : `LIMIT ${n}`);

/** A text value inside a JSON column: json('e.properties', 'request.body.Receiver'). */
export function json(column, path) {
  if (isMssql) return `JSON_VALUE(${column}, '$.${path}')`;
  const keys = path.split('.').map((k) => `'${k}'`);
  const last = keys.pop();
  return `${[column, ...keys].join('->')}->>${last}`;
}

/** Does the JSON column have this top-level key? */
export const hasKey = (column, key) =>
  isMssql ? `JSON_PATH_EXISTS(${column}, '$.${key}') = 1` : `jsonb_exists(${column}, '${key}')`;

/** Text → number (NULL when it isn't one). */
export const toNumber = (expr) => (isMssql ? `TRY_CAST(${expr} AS float)` : `CAST(NULLIF(${expr}, '') AS numeric)`);

/** "25,000 ₭" / "25000" → 25000 (NULL when it isn't a number). */
export const money = (expr) =>
  isMssql
    ? `TRY_CAST(NULLIF(REPLACE(REPLACE(REPLACE(${expr}, ',', ''), ' ', ''), N'₭', ''), '') AS decimal(18, 2))`
    : `CAST(NULLIF(regexp_replace(${expr}, '[^0-9.]', '', 'g'), '') AS numeric)`;

/** Number of items in a JSON array column (0 for NULL). */
export const jsonLength = (column) =>
  isMssql
    ? `(SELECT COUNT(*) FROM OPENJSON(${column}))`
    : `jsonb_array_length(COALESCE(${column}, CAST('[]' AS jsonb)))`;

/** Joins a row-by-row subquery: CROSS APPLY (SQL Server) / CROSS JOIN LATERAL (PostgreSQL). */
export const lateral = (subquery, alias) =>
  isMssql ? `CROSS APPLY (${subquery}) AS ${alias}` : `CROSS JOIN LATERAL (${subquery}) AS ${alias}`;

/**
 * Rows of a JSON array column as a table:
 * jsonRows('active_packages', 'pkg', { name: 'name', remainMb: 'remainMb' }) → pkg."name", pkg."remainMb" (text).
 */
export function jsonRows(column, alias, fields) {
  const names = Object.keys(fields);
  if (isMssql) {
    const cols = names.map((n) => `"${n}" nvarchar(400) '$.${fields[n]}'`).join(', ');
    return `CROSS APPLY OPENJSON(${column}) WITH (${cols}) AS ${alias}`;
  }
  const cols = names.map((n) => `"${n}" text`).join(', ');
  return `CROSS JOIN LATERAL jsonb_to_recordset(COALESCE(${column}, CAST('[]' AS jsonb))) AS ${alias}(${cols})`;
}

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * One row per local (server time) day from `since` to `until`, as JSON for
 * the DAYS table below: [{ date: "2026-11-23", day_start: ISO, day_end: ISO }, …].
 */
export function dayBuckets(since, until) {
  const days = [];
  const d = new Date(since);
  d.setHours(0, 0, 0, 0);
  while (d <= until && days.length < 400) {
    const start = new Date(d);
    d.setDate(d.getDate() + 1);
    days.push({ date: localDate(start), day_start: start.toISOString(), day_end: d.toISOString() });
  }
  return JSON.stringify(days);
}

/** Table `d` (date, day_start, day_end) from the `:days` replacement (see dayBuckets). */
export const DAYS = isMssql
  ? `OPENJSON(:days) WITH (date char(10) '$.date', day_start datetimeoffset '$.day_start', day_end datetimeoffset '$.day_end') AS d`
  : `jsonb_to_recordset(CAST(:days AS jsonb)) AS d(date text, day_start timestamptz, day_end timestamptz)`;
