#!/usr/bin/env node
/**
 * MyTrackHub server agent — runs as root on a Linux server (systemd service).
 *
 *  1. Server activity → API (shown on the website: Logs → Server logs)
 *     - journald: SSH sign-ins / failures / sign-outs, sudo, su, user + group changes
 *     - auditd:   file deletes / changes in watched folders, account files,
 *                 attempts to change or stop auditing (rules: 60-mytrackhub.rules)
 *  2. Cache sizes → API every few minutes (Server → Clear cache)
 *  3. Cache-clear requests from the website: only the fixed actions in ACTIONS
 *     below. The website can never send a command of its own.
 *
 * Nothing is lost if the API is down: read positions (journal cursor, audit
 * file offset) are saved only after the API accepted the batch, so the same
 * entries are simply sent again (the API ignores ones it already has).
 *
 * No npm packages: Node 18+ only. Settings come from /etc/mytrackhub-agent.env.
 */
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const VERSION = '1.1.0';
const run = promisify(execFile);

// ── settings ──
const need = (k) => {
  const v = process.env[k];
  if (!v) {
    console.error(`Missing ${k} (see /etc/mytrackhub-agent.env)`);
    process.exit(1);
  }
  return v;
};
const API = need('API_URL').replace(/\/$/, ''); // e.g. http://127.0.0.1:4000/api/v1/server-agent
const KEY = need('AGENT_KEY');
const HOST = process.env.HOST_LABEL || os.hostname();
const STATE_DIR = process.env.STATE_DIR || '/var/lib/mytrackhub-agent';
const AUDIT_LOG = process.env.AUDIT_LOG || '/var/log/audit/audit.log';
const POLL_MS = Number(process.env.POLL_MS || 5000);
const HEARTBEAT_MS = 60_000;
const CACHE_REPORT_MS = Number(process.env.CACHE_REPORT_MS || 300_000);
const JOURNAL_KEEP = process.env.JOURNAL_KEEP || '7d';
const TMP_DAYS = Number(process.env.TMP_DAYS || 7);
const PM2_LOG_DIR = process.env.PM2_LOG_DIR || '';
// Only these PM2 log files are ever emptied (other apps' logs are left alone).
const PM2_LOG_PREFIX = process.env.PM2_LOG_PREFIX || 'mytrackhub-';
const NGINX_CACHE_DIR = process.env.NGINX_CACHE_DIR || '';
const BATCH = 400;
const startedAt = new Date().toISOString();

const log = (...a) => console.log(new Date().toISOString(), ...a);
const hash = (...parts) => crypto.createHash('sha1').update(parts.join('|')).digest('hex');

// ── state (read positions), saved only after a successful send ──
const STATE_FILE = path.join(STATE_DIR, 'state.json');
fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
let state = { journalCursor: null, audit: { ino: null, offset: 0 } };
try {
  state = { ...state, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
} catch {
  /* first run */
}
function saveState() {
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(tmp, STATE_FILE);
}

// ── API ──
async function api(method, pathname, body) {
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-agent-key': KEY },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`${method} ${pathname} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
let lastSent = 0;
let lastAuditdState = null;
async function send(events, extra = {}) {
  for (let i = 0; i < Math.max(events.length, 1); i += BATCH) {
    await api('POST', '/events', {
      host: HOST,
      agentVersion: VERSION,
      startedAt,
      auditd: lastAuditdState,
      ...extra,
      events: events.slice(i, i + BATCH),
    });
  }
  lastSent = Date.now();
}

// ── user names (auid / uid → name) ──
let users = new Map();
let usersAt = 0;
function userName(id) {
  if (id === undefined || id === null || id === '' || id === '4294967295' || id === '-1' || id === 'unset') return null;
  if (Date.now() - usersAt > 60_000) {
    users = new Map();
    try {
      for (const line of fs.readFileSync('/etc/passwd', 'utf8').split('\n')) {
        const c = line.split(':');
        if (c.length > 2) users.set(c[2], c[0]);
      }
    } catch {
      /* keep ids */
    }
    usersAt = Date.now();
  }
  return users.get(String(id)) ?? `uid ${id}`;
}

// ═════════════ journald: ssh, sudo, su, account tools ═════════════
const IDENTS = ['sshd', 'sshd-session', 'sudo', 'su', 'useradd', 'userdel', 'usermod', 'groupadd', 'groupdel', 'groupmod', 'passwd', 'chpasswd', 'gpasswd'];

async function readJournal() {
  const args = ['-o', 'json', '--no-pager', ...IDENTS.map((i) => `SYSLOG_IDENTIFIER=${i}`)];
  if (state.journalCursor) args.push(`--after-cursor=${state.journalCursor}`);
  else args.push('--since=-24h'); // first run: the last day
  let stdout = '';
  try {
    ({ stdout } = await run('journalctl', args, { maxBuffer: 256 * 1024 * 1024 }));
  } catch (err) {
    if (err.stdout) stdout = err.stdout;
    else throw err;
  }
  const events = [];
  let cursor = state.journalCursor;
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    let j;
    try {
      j = JSON.parse(line);
    } catch {
      continue;
    }
    cursor = j.__CURSOR;
    const e = parseJournal(j);
    if (e) events.push(e);
  }
  return { events, cursor };
}

function parseJournal(j) {
  const id = j.SYSLOG_IDENTIFIER;
  const msg = typeof j.MESSAGE === 'string' ? j.MESSAGE : Array.isArray(j.MESSAGE) ? Buffer.from(j.MESSAGE).toString('utf8') : '';
  const at = new Date(Number(j.__REALTIME_TIMESTAMP) / 1000).toISOString();
  const actor = userName(j._AUDIT_LOGINUID);
  const base = { key: hash(HOST, 'j', j.__CURSOR), at, detail: { source: 'journal', program: id, pid: j._PID ?? null, message: msg.slice(0, 1000) } };
  let m;

  if (id === 'sshd' || id === 'sshd-session') {
    if ((m = msg.match(/^Accepted (\S+) for (\S+) from (\S+) port (\d+)/))) {
      return { ...base, type: 'login_ok', user: m[2], sourceIp: m[3], success: true, summary: `SSH sign-in (${m[1]}) from ${m[3]}` };
    }
    if ((m = msg.match(/^Failed (\S+) for (invalid user )?(\S+) from (\S+) port/))) {
      return {
        ...base,
        type: 'login_fail',
        user: m[3],
        sourceIp: m[4],
        success: false,
        summary: `SSH sign-in failed (${m[1]})${m[2] ? ' — unknown user' : ''} from ${m[4]}`,
      };
    }
    if ((m = msg.match(/maximum authentication attempts exceeded for (invalid user )?(\S+) from (\S+)/))) {
      return { ...base, type: 'login_fail', user: m[2], sourceIp: m[3], success: false, summary: `SSH: too many failed attempts from ${m[3]}` };
    }
    if ((m = msg.match(/session closed for user (\S+)/))) {
      return { ...base, type: 'logout', user: m[1], success: true, summary: 'SSH session closed' };
    }
    return null;
  }

  if (id === 'sudo') {
    if (/pam_unix|session (opened|closed)/.test(msg)) return null;
    m = msg.match(/^\s*(\S+) : (.*)$/);
    if (!m) return null;
    const who = m[1];
    const rest = m[2];
    const ci = rest.indexOf('COMMAND=');
    const command = ci >= 0 ? rest.slice(ci + 8) : null;
    const fields = {};
    const notes = [];
    for (const p of (ci >= 0 ? rest.slice(0, ci) : rest).split(' ; ').filter(Boolean)) {
      const k = p.match(/^([A-Z]+)=(.*)$/);
      if (k) fields[k[1]] = k[2];
      else notes.push(p.trim());
    }
    const failed = notes.some((n) => /incorrect password|NOT in sudoers|not allowed|authentication failure/i.test(n));
    return {
      ...base,
      type: 'sudo',
      user: who,
      runAs: fields.USER ?? 'root',
      success: !failed,
      summary: `${failed ? 'sudo refused' : 'sudo'}: ${command ?? notes.join('; ')}`.slice(0, 500),
      detail: { ...base.detail, command, tty: fields.TTY ?? null, cwd: fields.PWD ?? null, notes },
    };
  }

  if (id === 'su') {
    if ((m = msg.match(/^(FAILED SU )?\(to (\S+)\) (\S+) on (\S+)/))) {
      return { ...base, type: 'su', user: m[3], runAs: m[2], success: !m[1], summary: `${m[1] ? 'su failed' : 'su'} to ${m[2]} (${m[4]})` };
    }
    return null;
  }

  // useradd, userdel, usermod, passwd, chpasswd, group*: anything that is not PAM noise
  if (/^pam_/.test(msg)) return null;
  return { ...base, type: 'account_change', user: actor, runAs: userName(j._UID), success: !/fail|error/i.test(msg), summary: `${id}: ${msg}`.slice(0, 500) };
}

// ═════════════ auditd: file deletes / changes, identity, tamper ═════════════
const KEY_TYPE = { mth_delete: 'file_delete', mth_change: 'file_change', mth_identity: 'account_change', mth_audit: 'audit_tamper' };
const HEX_FIELDS = new Set(['name', 'comm', 'exe', 'proctitle', 'cwd', 'key']);

function parseFields(text) {
  const out = {};
  // Enriched logs append  \x1dAUID="alice" UID="root" …
  const [raw, enriched = ''] = text.split('\x1d');
  for (const [part, prefix] of [
    [raw, ''],
    [enriched, 'E_'],
  ]) {
    for (const m of part.matchAll(/([\w-]+)=("([^"]*)"|'([^']*)'|(\S+))/g)) {
      let v = m[3] ?? m[4] ?? m[5];
      const k = prefix + m[1];
      // Unquoted hex = a value with spaces or special characters, hex-encoded by auditd.
      if (m[5] !== undefined && HEX_FIELDS.has(m[1]) && /^[0-9A-F]+$/.test(v) && v.length % 2 === 0) {
        v = Buffer.from(v, 'hex').toString('utf8').replace(/\0/g, ' ').trim();
      }
      out[k] = v;
    }
  }
  return out;
}

/** New complete lines of the audit log since the saved offset (handles rotation). */
async function readAuditLines() {
  let st;
  try {
    st = await fsp.stat(AUDIT_LOG);
  } catch {
    return { lines: [], next: state.audit };
  }
  const chunks = [];
  let { ino, offset } = state.audit;
  if (ino !== null && ino !== st.ino) {
    // Rotated: finish the old file first (now audit.log.1 or similar), then start the new one.
    const dir = path.dirname(AUDIT_LOG);
    for (const name of await fsp.readdir(dir)) {
      if (!name.startsWith(path.basename(AUDIT_LOG))) continue;
      const p = path.join(dir, name);
      const s2 = await fsp.stat(p).catch(() => null);
      if (s2 && s2.ino === ino && s2.size > offset) chunks.push(await readRange(p, offset, s2.size));
    }
    offset = 0;
  }
  if (st.size < offset) offset = 0; // truncated
  let text = '';
  if (st.size > offset) text = await readRange(AUDIT_LOG, offset, Math.min(st.size, offset + 32 * 1024 * 1024));
  const end = text.lastIndexOf('\n');
  const complete = end >= 0 ? text.slice(0, end + 1) : '';
  const next = { ino: st.ino, offset: offset + Buffer.byteLength(complete) };
  return { lines: (chunks.join('') + complete).split('\n').filter(Boolean), next };
}
async function readRange(file, start, end) {
  const fh = await fsp.open(file, 'r');
  try {
    const buf = Buffer.alloc(end - start);
    await fh.read(buf, 0, buf.length, start);
    return buf.toString('utf8');
  } finally {
    await fh.close();
  }
}

function auditEvents(lines) {
  // group records of one event by its serial: msg=audit(1700000000.123:4567)
  const groups = new Map();
  for (const line of lines) {
    const m = line.match(/^type=(\S+) msg=audit\((\d+)\.(\d+):(\d+)\):\s?(.*)$/);
    if (!m) continue;
    const id = `${m[2]}.${m[3]}:${m[4]}`;
    if (!groups.has(id)) groups.set(id, { id, ts: Number(m[2]) * 1000 + Number(m[3]), recs: [] });
    groups.get(id).recs.push({ type: m[1], f: parseFields(m[5]) });
  }

  const singles = [];
  for (const g of groups.values()) {
    const sys = g.recs.find((r) => r.type === 'SYSCALL')?.f;
    const at = new Date(g.ts).toISOString();
    const base = { key: hash(HOST, 'a', g.id), at };

    // auditd itself stopped / rules changed
    const daemon = g.recs.find((r) => /^DAEMON_(END|ABORT)$/.test(r.type));
    if (daemon) {
      const who = daemon.f.E_AUID ?? userName(daemon.f.auid);
      singles.push({ ...base, type: 'audit_tamper', user: who, success: false, summary: `auditd stopped (${daemon.type})`, detail: { source: 'audit', record: daemon.f } });
      continue;
    }
    const conf = g.recs.find((r) => r.type === 'CONFIG_CHANGE');
    if (conf && !sys) {
      const who = conf.f.E_AUID ?? userName(conf.f.auid);
      if (!who) continue; // boot-time rule loading
      singles.push({ ...base, type: 'audit_tamper', user: who, success: conf.f.res !== '0', summary: `Audit rules changed (${conf.f.op ?? 'change'})`, detail: { source: 'audit', record: conf.f } });
      continue;
    }
    if (!sys) continue;
    const type = KEY_TYPE[sys.key];
    if (!type) continue;
    const user = sys.E_AUID ?? userName(sys.auid);
    if (!user) continue; // system daemons (no human login behind it)
    const cwd = g.recs.find((r) => r.type === 'CWD')?.f.cwd ?? '';
    const paths = g.recs
      .filter((r) => r.type === 'PATH' && r.f.name && r.f.name !== '(null)')
      .filter((r) => (type === 'file_delete' ? ['DELETE', 'PARENT'].includes(r.f.nametype) : r.f.nametype !== 'PARENT'))
      .map((r) => (r.f.name.startsWith('/') ? r.f.name : path.posix.join(cwd || '/', r.f.name)));
    const deleted = type === 'file_delete' ? g.recs.filter((r) => r.type === 'PATH' && r.f.nametype === 'DELETE').map((r) => (r.f.name.startsWith('/') ? r.f.name : path.posix.join(cwd || '/', r.f.name))) : paths;
    const command = g.recs.find((r) => r.type === 'PROCTITLE')?.f.proctitle ?? sys.exe ?? sys.comm;
    singles.push({
      ...base,
      type,
      user,
      runAs: sys.E_UID ?? userName(sys.uid),
      success: sys.success === 'yes',
      pid: sys.pid,
      command,
      paths: deleted.length ? deleted : paths,
      detail: { source: 'audit', key: sys.key, syscall: sys.E_SYSCALL ?? sys.syscall, exe: sys.exe, comm: sys.comm, tty: sys.tty, ses: sys.ses },
    });
  }

  // One "rm -rf" can delete thousands of files: merge per process + type.
  const merged = new Map();
  const out = [];
  for (const e of singles) {
    if (!e.pid) {
      out.push(e);
      continue;
    }
    const k = `${e.type}|${e.pid}|${e.user}|${e.success}`;
    const m = merged.get(k);
    if (!m) merged.set(k, { ...e, count: e.paths.length || 1, sample: [...e.paths], keys: [e.key] });
    else {
      m.count += e.paths.length || 1;
      if (m.sample.length < 30) m.sample.push(...e.paths.slice(0, 30 - m.sample.length));
      m.keys.push(e.key);
    }
  }
  const verb = { file_delete: 'Deleted', file_change: 'Changed', account_change: 'Changed account file', audit_tamper: 'Touched audit config' };
  for (const m of merged.values()) {
    const first = m.sample[0] ?? '';
    const what = m.count > 1 ? `${m.count} files (${first}${m.count > 1 ? ', …' : ''})` : first;
    out.push({
      key: hash(...m.keys),
      at: m.at,
      type: m.type,
      user: m.user,
      runAs: m.runAs,
      success: m.success,
      summary: `${verb[m.type]} ${what}${m.command ? ` — ${m.command}` : ''}`.slice(0, 500),
      detail: { ...m.detail, pid: m.pid, command: m.command, count: m.count, paths: m.sample },
    });
  }
  return out;
}

// ═════════════ caches: sizes + the fixed clear actions ═════════════
async function sh(cmd, args, timeout = 600_000) {
  try {
    const { stdout, stderr } = await run(cmd, args, { timeout, maxBuffer: 16 * 1024 * 1024 });
    return `${stdout}${stderr}`.trim();
  } catch (err) {
    throw new Error(`${cmd} ${args.join(' ')}: ${(err.stderr || err.message || '').toString().slice(0, 500)}`);
  }
}
async function duBytes(dir) {
  try {
    const out = await sh('du', ['-sb', dir], 120_000);
    return Number(out.split(/\s+/)[0]) || 0;
  } catch {
    return null;
  }
}
async function memCacheBytes() {
  const t = await fsp.readFile('/proc/meminfo', 'utf8');
  const kb = (k) => Number(t.match(new RegExp(`^${k}:\\s+(\\d+)`, 'm'))?.[1] ?? 0) * 1024;
  return kb('Cached') + kb('Buffers') + kb('SReclaimable');
}
async function journalBytes() {
  const out = await sh('journalctl', ['--disk-usage']).catch(() => '');
  const m = out.match(/take up ([\d.]+)([BKMGT])/);
  if (!m) return null;
  return Math.round(Number(m[1]) * 1024 ** 'BKMGT'.indexOf(m[2]));
}
// Old temporary files: only /tmp (never /var/tmp, which programs use to keep
// files across reboots), only regular files neither read NOR changed for
// TMP_DAYS days, never inside system folders, never a file any program has open.
const TMP_SKIP = ['/tmp/systemd-private-', '/tmp/snap-private-tmp', '/tmp/.X11-unix', '/tmp/.ICE-unix', '/tmp/.font-unix', '/tmp/.XIM-unix', '/tmp/.Test-unix'];
async function openFiles() {
  const open = new Set();
  for (const pid of await fsp.readdir('/proc').catch(() => [])) {
    if (!/^\d+$/.test(pid)) continue;
    for (const fd of await fsp.readdir(`/proc/${pid}/fd`).catch(() => [])) {
      const target = await fsp.readlink(`/proc/${pid}/fd/${fd}`).catch(() => null);
      if (target?.startsWith('/tmp/')) open.add(target);
    }
  }
  return open;
}
async function oldTmpFiles() {
  const out = await sh('find', ['/tmp', '-xdev', '-type', 'f', '-atime', `+${TMP_DAYS}`, '-mtime', `+${TMP_DAYS}`, '-printf', '%s\t%p\n'], 120_000).catch(() => '');
  const open = await openFiles();
  return out
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf('\t');
      return { size: Number(l.slice(0, i)) || 0, path: l.slice(i + 1) };
    })
    .filter((f) => !TMP_SKIP.some((p) => f.path.startsWith(p)) && !open.has(f.path));
}
async function oldTmpBytes() {
  return (await oldTmpFiles()).reduce((s, f) => s + f.size, 0);
}
async function pm2LogBytes() {
  if (!PM2_LOG_DIR) return null;
  let total = 0;
  for (const f of await fsp.readdir(PM2_LOG_DIR).catch(() => [])) {
    if (f.startsWith(PM2_LOG_PREFIX) && f.endsWith('.log')) total += (await fsp.stat(path.join(PM2_LOG_DIR, f)).catch(() => ({ size: 0 }))).size;
  }
  return total;
}
async function cacheSizes() {
  const [page_cache, journal, apt, tmp, pm2_logs, nginx_cache] = await Promise.all([
    memCacheBytes().catch(() => null),
    journalBytes(),
    fs.existsSync('/var/cache/apt/archives') ? duBytes('/var/cache/apt/archives') : null,
    oldTmpBytes(),
    pm2LogBytes(),
    NGINX_CACHE_DIR ? duBytes(NGINX_CACHE_DIR) : null,
  ]);
  return { page_cache, journal, apt, tmp, pm2_logs, nginx_cache };
}

/** The ONLY things the website can ask for. Each returns { freed, output }. */
const ACTIONS = {
  async page_cache() {
    const before = await memCacheBytes();
    await sh('sync', []);
    await fsp.writeFile('/proc/sys/vm/drop_caches', '3');
    const after = await memCacheBytes();
    return { freed: Math.max(0, before - after), output: `Page cache before ${before} B, after ${after} B` };
  },
  async journal() {
    const before = await journalBytes();
    const out = await sh('journalctl', [`--vacuum-time=${JOURNAL_KEEP}`]);
    const after = await journalBytes();
    return { freed: before !== null && after !== null ? Math.max(0, before - after) : null, output: out };
  },
  async apt() {
    if (!fs.existsSync('/usr/bin/apt-get')) throw new Error('apt-get is not installed on this server');
    const before = await duBytes('/var/cache/apt/archives');
    const out = await sh('apt-get', ['clean']);
    const after = await duBytes('/var/cache/apt/archives');
    return { freed: Math.max(0, (before ?? 0) - (after ?? 0)), output: out || 'apt-get clean done' };
  },
  async tmp() {
    const files = await oldTmpFiles();
    let freed = 0;
    const done = [];
    for (const f of files) {
      try {
        await fsp.unlink(f.path);
        freed += f.size;
        done.push(f.path);
      } catch {
        /* gone or in use: skip */
      }
    }
    return { freed, output: done.length ? `Deleted ${done.length} file(s):\n${done.join('\n')}`.slice(0, 15000) : 'Nothing old enough to delete.' };
  },
  async pm2_logs() {
    if (!PM2_LOG_DIR) throw new Error('PM2_LOG_DIR is not set in /etc/mytrackhub-agent.env');
    let freed = 0;
    const done = [];
    for (const f of await fsp.readdir(PM2_LOG_DIR)) {
      if (!f.startsWith(PM2_LOG_PREFIX) || !f.endsWith('.log')) continue;
      const p = path.join(PM2_LOG_DIR, f);
      const { size } = await fsp.stat(p);
      await fsp.truncate(p, 0);
      freed += size;
      done.push(`${f} (${size} B)`);
    }
    return { freed, output: done.length ? `Emptied: ${done.join(', ')}` : `No ${PM2_LOG_PREFIX}*.log files found.` };
  },
  async nginx_cache() {
    if (!NGINX_CACHE_DIR) throw new Error('NGINX_CACHE_DIR is not set in /etc/mytrackhub-agent.env');
    const before = await duBytes(NGINX_CACHE_DIR);
    for (const f of await fsp.readdir(NGINX_CACHE_DIR)) await fsp.rm(path.join(NGINX_CACHE_DIR, f), { recursive: true, force: true });
    return { freed: before, output: `Emptied ${NGINX_CACHE_DIR}` };
  },
};

async function runTasks() {
  const tasks = await api('GET', `/tasks?host=${encodeURIComponent(HOST)}`);
  for (const t of tasks) {
    const fn = ACTIONS[t.action];
    let result;
    try {
      if (!fn) throw new Error(`Unknown action ${t.action}`);
      log('task', t.id, t.action);
      const r = await fn();
      result = { host: HOST, ok: true, freedBytes: r.freed ?? null, output: r.output ?? '' };
    } catch (err) {
      result = { host: HOST, ok: false, output: String(err.message ?? err) };
    }
    await api('POST', `/tasks/${t.id}/result`, result);
    lastCacheReport = 0; // report fresh sizes right away
  }
}

// ═════════════ main loop ═════════════
async function auditdActive() {
  try {
    return (await sh('systemctl', ['is-active', 'auditd'], 5000)) === 'active';
  } catch {
    return false;
  }
}

let lastCacheReport = 0;
let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    const [journal, audit] = await Promise.all([readJournal(), readAuditLines()]);
    const events = [...journal.events, ...auditEvents(audit.lines)];
    lastAuditdState = await auditdActive();
    let extra = {};
    if (Date.now() - lastCacheReport > CACHE_REPORT_MS) {
      extra = { caches: await cacheSizes() };
    }
    if (events.length || extra.caches || Date.now() - lastSent > HEARTBEAT_MS) {
      await send(events, extra);
      if (extra.caches) lastCacheReport = Date.now();
    }
    // Only now that the API has them: move the read positions forward.
    state.journalCursor = journal.cursor;
    state.audit = audit.next;
    saveState();
    await runTasks();
  } catch (err) {
    log('error:', err.message);
  } finally {
    busy = false;
  }
}

async function lifecycle(type, summary) {
  try {
    await send([{ key: hash(HOST, type, startedAt, Date.now()), at: new Date().toISOString(), type, user: 'agent', success: type === 'agent_start', summary }]);
  } catch (err) {
    log(`could not report ${type}:`, err.message);
  }
}

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    log('stopping');
    await lifecycle('agent_stop', `Agent stopped (${sig})`);
    process.exit(0);
  });
}

log(`MyTrackHub agent ${VERSION} on ${HOST} → ${API}`);
await lifecycle('agent_start', `Agent started (v${VERSION})`);
await tick();
setInterval(tick, POLL_MS);
