import { QueryTypes } from 'sequelize';
import { config } from '../../config/index.js';
import { sequelize } from '../../db/index.js';
import { logger } from '../../utils/logger.js';
import { geminiJson } from './gemini.provider.js';

/**
 * "Ask the system": questions about our own data are answered WITHOUT the data
 * leaving the company. Gemini only sees the question (phone numbers / IDs masked)
 * and the table + column NAMES, and writes one read-only SELECT. Our server checks
 * and runs it; the rows are shown to the person and never sent to the AI.
 */

// Tables the AI may read, with a short meaning for each. Anything else (admin
// accounts, settings, AI chats…) is never offered and is refused if named.
const TABLES = {
  app_users: 'MyTPlus mobile app users: one row per phone number (msisdn); first/last seen, logins, platform, packages.',
  events:
    'Everything app users did: type is one of login, logout, screen_view, tap, action, api, error; name = what; occurred_at = when; success/result for API calls; properties = JSON details.',
  ccare_logs: 'CCare web portal audit log: who (name/actor) did which action, success, ip, at = when; detail = JSON.',
  server_logs:
    'Linux server audit log: logins (ssh), sudo, file deletions and changes; type, user, source_ip, success, summary, at = when.',
  server_metrics: 'Server capacity readings every 5 min: cpu %, memory and disk bytes, network bytes/s, at = when.',
  server_tasks: 'Cache-clear tasks run on the server: action, status, who requested, freed_bytes.',
  server_agents: 'The monitoring agent on each server: host, version, last seen.',
  Tb_User_detail:
    'CCare staff accounts: Name (username), Name_la, Staffid, stafftel (phone), BrandID (branch), Division, POSITION, Status, ANB (99 = closed), cdate (created).',
  Tb_Brand: 'Branches: BID and Bname.',
  ccare_accounts_dev: 'CCare staff accounts (development copy): same columns as Tb_User_detail.',
};
// Columns that are never read, whatever the question.
const SECRET = /pass(word|wd)?|pwd|secret|token|api_?key|otp|code_?hash|salt|hash/i;
const MAX_ROWS = 50_000;

// Words that suggest a question about OUR data (English, Lao, Hmong, Thai). Only
// then is the AI asked to plan a query (saves quota); 🔒 System mode always plans.
const INTERNAL_HINTS = [
  /\b(users?|subscribers?|customers?|msisdn|logins?|logged|sign[- ]?ins?|active|events?|actions?|taps?|screens?|transfers?|packages?|app|report|dashboard|ccare|staff|accounts?|branch(es)?|server|cpu|ram|memory|disk|logs?|how many|count|total|top \d+|today|yesterday|this (week|month)|last \d+ days)\b/i,
  /ຜູ້ໃຊ້|ລູກຄ້າ|ເຂົ້າລະບົບ|ລາຍງານ|ຈຳນວນ|ທັງໝົດ|ມື້ນີ້|ມື້ວານ|ອາທິດ|ເດືອນນີ້|ເບີ|ແພັກເກັດ|ພະນັກງານ|ສາຂາ|ບັນຊີ|ເຊີບເວີ|ເຊີເວີ|ໂອນ|ສະຫຼຸບ/,
  /\b(neeg siv|pes tsawg|tag nrho|hnub no|nag hmo|lub lim tiam|lub hli no|tus lej|xov tooj|ceg|pawg)\b/i,
  /ผู้ใช้|ลูกค้า|เข้าสู่ระบบ|รายงาน|จำนวน|ทั้งหมด|วันนี้|เมื่อวาน|แพ็กเกจ|พนักงาน|สาขา|เซิร์ฟเวอร์/,
  /(?<!\d)(?:\+?856)?0?20\d{8}(?!\d)/,
];
export const looksInternal = (text) => INTERNAL_HINTS.some((r) => r.test(text || ''));

let schemaCache = { at: 0, text: '', tables: new Set() };

/** The allowed tables that exist here, with their (non-secret) columns. Cached 10 minutes. */
async function schema() {
  if (Date.now() - schemaCache.at < 600_000 && schemaCache.text) return schemaCache;
  const qi = sequelize.getQueryInterface();
  const existing = new Set((await qi.showAllTables()).map((t) => (typeof t === 'string' ? t : t.tableName)));
  const lines = [];
  const tables = new Set();
  for (const [table, meaning] of Object.entries(TABLES)) {
    if (!existing.has(table)) continue;
    try {
      const cols = await qi.describeTable(table);
      const list = Object.entries(cols)
        .filter(([c]) => !SECRET.test(c))
        .map(([c, d]) => `${c} ${String(d.type).toLowerCase().replace(/\(.*$/, '')}`)
        .join(', ');
      lines.push(`- ${table}: ${meaning}\n  columns: ${list}`);
      tables.add(table.toLowerCase());
    } catch (err) {
      logger.warn({ table, err: err.message }, 'AI system data: cannot describe table');
    }
  }
  schemaCache = { at: Date.now(), text: lines.join('\n'), tables };
  return schemaCache;
}

const dialectHelp = () =>
  config.db.dialect === 'mssql'
    ? 'Microsoft SQL Server (T-SQL): use TOP (n) not LIMIT; dates: SYSUTCDATETIME(), DATEADD, DATEDIFF, CAST(x AS date). Laos time is UTC+7: local date of a column = CAST(DATEADD(hour, 7, col) AS date); today in Laos = CAST(DATEADD(hour, 7, SYSUTCDATETIME()) AS date). JSON: JSON_VALUE(col, \'$.key\').'
    : 'PostgreSQL: use LIMIT n; dates: now(), interval, date_trunc. Laos time is UTC+7: local date of a column = (col AT TIME ZONE \'Asia/Vientiane\')::date; today in Laos = (now() AT TIME ZONE \'Asia/Vientiane\')::date. JSON columns are text: use (col::jsonb ->> \'key\'). Quote mixed-case names with double quotes.';

/**
 * Asks Gemini whether the question is about our system's data, and if so for a
 * SELECT. Returns { scope: 'internal', sql, title, explain } or { scope: 'external' }.
 * `force` = 'internal' when the person chose "🔒 System".
 */
export async function plan({ question, context, force, signal, onStatus }) {
  const s = await schema();
  if (!s.text) return { scope: 'external' };
  const system = [
    'You route questions for the MyTPlus admin website of T-Plus (a mobile operator in Laos) and write SQL.',
    'Decide if the question needs data from OUR system database described below (our app users, their activity, CCare staff and logs, our servers).',
    'General knowledge, writing, translating, news, prices, how-to, or anything not stored in these tables is "external".',
    force === 'internal' ? 'The user chose SYSTEM mode: always answer with scope "internal" and a query.' : '',
    `Database: ${dialectHelp()}`,
    'Rules for the SQL: exactly ONE read-only SELECT (a WITH … SELECT is fine); only the tables listed; name every column (no SELECT *);',
    'readable column aliases in English; ORDER BY something useful; at most 1000 rows unless the user asks for all; no comments; no semicolons.',
    'Placeholders such as [PHONE_1], [NUMBER_1], [EMAIL_1] stand for values the user typed: use them inside quotes, e.g. msisdn = \'[PHONE_1]\'.',
    'Phone numbers (msisdn, stafftel) are stored as text like 2012345678 (no 0, no 856).',
    'Answer ONLY with JSON: {"scope":"internal","title":"short title","explain":"one short sentence in the user\'s language saying what the result shows","sql":"…"}',
    'or {"scope":"external"}.',
    '',
    'Tables:',
    s.text,
  ]
    .filter(Boolean)
    .join('\n');
  const prompt = `${context ? `Earlier in this chat:\n${context}\n\n` : ''}Question: ${question}`;
  const { data, model } = await geminiJson({ system, prompt, signal, onStatus });
  if (data?.scope !== 'internal' || !data.sql) return { scope: 'external', model };
  return {
    scope: 'internal',
    model,
    sql: String(data.sql).trim(),
    title: String(data.title || 'Result').slice(0, 120),
    explain: String(data.explain || '').slice(0, 300),
  };
}

const BLOCKED =
  /\b(insert|update|delete|merge|drop|alter|create|truncate|exec|execute|grant|revoke|deny|backup|restore|shutdown|dbcc|waitfor|openrowset|opendatasource|openquery|openjson|bulk|into|use|declare|set|kill|reconfigure|copy|dblink|call|do|lock|vacuum|analyze|listen|notify|load|attach|pragma)\b|\b(xp_|sp_|pg_|lo_|fn_)\w*/i;

/** Only a single read-only SELECT on the allowed tables, never a secret column. Throws why not. */
export async function checkSql(sql) {
  const s = await schema();
  const text = sql.replace(/;\s*$/, '').trim();
  if (!/^(select|with)\b/i.test(text)) throw new Error('Only reading queries (SELECT) are allowed.');
  if (/;|--|\/\*|\*\//.test(text)) throw new Error('Only one simple query is allowed.');
  // Look at the SQL without its string literals (values may contain any word).
  const code = text.replace(/'(?:[^']|'')*'/g, "''");
  const bad = code.match(BLOCKED);
  if (bad) throw new Error(`Not allowed in a reading query: ${bad[0]}`);
  if (SECRET.test(code)) throw new Error('Passwords and other secrets are never shown.');
  if (/select\s+(top\s*\(?\s*\d+\s*\)?\s+)?(distinct\s+)?\*|\.\*/i.test(code)) {
    throw new Error('The query must name its columns (no SELECT *).');
  }
  const ctes = new Set([...code.matchAll(/(?:\bwith|,)\s*([\w"[\]]+)\s+as\s*\(/gi)].map((m) => clean(m[1])));
  for (const m of code.matchAll(/\b(from|join)\s+(?!\()([\w"[\].]+)/gi)) {
    const name = clean(m[2]);
    if (!s.tables.has(name) && !ctes.has(name)) throw new Error(`The table "${m[2]}" cannot be read here.`);
  }
  return text;
}
const clean = (n) =>
  String(n)
    .replace(/["[\]]/g, '')
    .replace(/^(dbo|public)\./i, '')
    .toLowerCase();

/** Runs the checked query in a read-only transaction that is always rolled back. */
export async function runReadOnly(sql, values) {
  // Placeholders → the real values the person typed (digits, e-mails: no quotes possible).
  const text = sql.replace(/\[(EMAIL|PHONE|NUMBER)_\d+\]/g, (k) => {
    const v = values.get(k);
    if (v === undefined || /['\\]/.test(v)) throw new Error(`Unknown value ${k}`);
    return v.replace(/[\s-]/g, '').replace(/^\+?856/, '').replace(/^0(?=[23]0)/, '');
  });
  const t = await sequelize.transaction();
  const started = Date.now();
  try {
    if (config.db.dialect === 'postgres') {
      await sequelize.query('SET TRANSACTION READ ONLY', { transaction: t });
      await sequelize.query("SET LOCAL statement_timeout = '20s'", { transaction: t });
    }
    const rows = await sequelize.query(text, { type: QueryTypes.SELECT, transaction: t });
    const columns = rows.length ? Object.keys(rows[0]) : [];
    return {
      columns,
      rows: rows.slice(0, MAX_ROWS).map((r) => columns.map((c) => cell(r[c]))),
      total: rows.length,
      ms: Date.now() - started,
    };
  } finally {
    await t.rollback().catch(() => {});
  }
}

function cell(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) return `(${v.length} bytes)`;
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'bigint') return Number(v);
  return v;
}

// ── showing the result (made here, not by the AI) ──

const isNum = (v) => typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && v.length < 16);
const fmt = (n) => (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 2 }));
const isoDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);
const laosTime = (iso) =>
  new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().replace('T', ' ').slice(0, 19).replace(/ 00:00:00$/, '');
const show = (v) => (v === null ? '' : isoDate(v) ? laosTime(v) : String(v));

/** Totals / averages / min / max of number columns, computed on our server. */
export function summary(r) {
  const out = [];
  if (r.total === 1 && r.columns.length <= 6) return out; // a single row speaks for itself
  r.columns.forEach((c, i) => {
    if (/(^|_)(id|msisdn|phone|tel|year|month|day|hour|bid)$/i.test(c)) return;
    const nums = r.rows.map((row) => row[i]).filter((v) => v !== null && isNum(v)).map(Number);
    if (nums.length < 2 || nums.length < r.rows.length * 0.8) return;
    const sum = nums.reduce((a, b) => a + b, 0);
    out.push(
      `**${c}**: total ${fmt(sum)} · average ${fmt(sum / nums.length)} · min ${fmt(Math.min(...nums))} · max ${fmt(Math.max(...nums))}`,
    );
  });
  return out.slice(0, 6);
}

const esc = (v) => show(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').slice(0, 200);

/** The answer text: what it shows, the numbers, the table (first rows), and the SQL used. */
export function toMarkdown({ title, explain, sql }, r, shown = 200) {
  const lines = [`### 🔒 ${title}`];
  if (explain) lines.push(explain);
  if (!r.total) {
    lines.push('', '_No rows found._');
  } else if (r.total === 1 && r.columns.length === 1) {
    lines.push('', `## ${isNum(r.rows[0][0]) ? fmt(Number(r.rows[0][0])) : esc(r.rows[0][0])}`);
  } else {
    const stats = summary(r);
    lines.push('', `**${fmt(r.total)} row${r.total === 1 ? '' : 's'}**${r.total > shown ? ` (first ${shown} shown; the CSV file has all of them)` : ''}`);
    if (stats.length) lines.push('', ...stats.map((s) => `- ${s}`));
    lines.push('', `| ${r.columns.map((c) => esc(c)).join(' | ')} |`, `| ${r.columns.map(() => '---').join(' | ')} |`);
    for (const row of r.rows.slice(0, shown)) lines.push(`| ${row.map(esc).join(' | ')} |`);
  }
  lines.push('', '<details><summary>SQL used</summary>', '', '```sql', sql, '```', '', '</details>');
  lines.push('', '_🔒 Answered from the system database on our server — this data was not sent to the AI._');
  return lines.join('\n');
}

/** All rows as CSV (Excel opens it; the BOM keeps Lao text readable). */
export function toCsv(r) {
  const q = (v) => {
    const s = show(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return Buffer.from(`\uFEFF${[r.columns, ...r.rows].map((row) => row.map(q).join(',')).join('\r\n')}\r\n`, 'utf8');
}
