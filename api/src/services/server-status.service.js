import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import { promisify } from 'node:util';
import { config } from '../config/index.js';
import { sequelize } from '../db/index.js';

const run = promisify(execFile);
const isLinux = process.platform === 'linux';
const SAMPLE_MS = 500;

/**
 * Capacity of the server this API runs on (the same machine nginx serves the
 * website from): CPU, memory, disks, disk I/O, network, load, services, PM2,
 * top processes, this API process and the database round-trip. Read-only and
 * without root: /proc, `df`, `ps`, `systemctl is-active`, `pm2 jlist`.
 * Every part is optional — a part that cannot be read is null, never an error.
 */
export async function status() {
  // Rates need two readings: take the first, wait, take the second.
  const [cpu1, net1, io1] = await Promise.all([cpuTimes(), netCounters(), diskCounters()]);
  await new Promise((r) => setTimeout(r, SAMPLE_MS));
  const [cpu2, net2, io2] = await Promise.all([cpuTimes(), netCounters(), diskCounters()]);

  const [memory, disks, inodes, processes, services, pm2, database, system] = await Promise.all([
    safe(memoryInfo),
    safe(diskUsage),
    safe(inodeUsage),
    safe(topProcesses),
    safe(serviceStates),
    safe(pm2Processes),
    safe(databasePing),
    safe(systemInfo),
  ]);

  const seconds = SAMPLE_MS / 1000;
  return {
    at: new Date().toISOString(),
    system,
    cpu: cpuUsage(cpu1, cpu2),
    load: { avg: os.loadavg(), cores: os.cpus().length },
    memory,
    disks: disks?.map((d) => ({ ...d, inodes: inodes?.find((i) => i.mount === d.mount) ?? null })) ?? null,
    diskIo: rates(io1, io2, seconds, ['readBytes', 'writeBytes', 'reads', 'writes']),
    network: rates(net1, net2, seconds, ['rxBytes', 'txBytes', 'rxPackets', 'txPackets']),
    processes,
    services,
    pm2,
    api: apiProcess(),
    database,
  };
}

async function safe(fn) {
  try {
    return await fn();
  } catch {
    return null;
  }
}

// ── CPU ──
function cpuTimes() {
  return os.cpus().map((c) => {
    const t = c.times;
    return { idle: t.idle, total: t.user + t.nice + t.sys + t.idle + t.irq, iowait: 0 };
  });
}
function cpuUsage(a, b) {
  const per = b.map((c, i) => {
    const total = c.total - (a[i]?.total ?? 0);
    const idle = c.idle - (a[i]?.idle ?? 0);
    return total > 0 ? Math.max(0, Math.min(100, (1 - idle / total) * 100)) : 0;
  });
  const first = os.cpus()[0];
  return {
    model: first?.model?.trim() ?? null,
    speedMHz: first?.speed ?? null,
    cores: per.length,
    usage: per.length ? per.reduce((s, v) => s + v, 0) / per.length : 0,
    perCore: per,
  };
}

// ── memory ──
async function memoryInfo() {
  const total = os.totalmem();
  if (!isLinux) {
    const free = os.freemem();
    return {
      total,
      used: total - free,
      free,
      available: free,
      buffers: null,
      cached: null,
      swapTotal: null,
      swapUsed: null,
    };
  }
  const kb = {};
  for (const line of (await fs.readFile('/proc/meminfo', 'utf8')).split('\n')) {
    const m = line.match(/^(\w+(?:\(\w+\))?):\s+(\d+)/);
    if (m) kb[m[1]] = Number(m[2]) * 1024;
  }
  const cached = (kb.Cached ?? 0) + (kb.SReclaimable ?? 0);
  const buffers = kb.Buffers ?? 0;
  const free = kb.MemFree ?? 0;
  const available = kb.MemAvailable ?? free + cached + buffers;
  return {
    total: kb.MemTotal ?? total,
    // "used" = what programs hold (not counting cache, which Linux gives back on demand)
    used: (kb.MemTotal ?? total) - free - buffers - cached,
    free,
    available,
    buffers,
    cached,
    shared: kb.Shmem ?? null,
    dirty: kb.Dirty ?? null,
    swapTotal: kb.SwapTotal ?? 0,
    swapUsed: (kb.SwapTotal ?? 0) - (kb.SwapFree ?? 0),
  };
}

// ── disks ──
const SKIP_FS = /^(tmpfs|devtmpfs|udev|none|overlay|shm|squashfs|efivarfs|map |devfs)/;
const SKIP_MOUNT = /^\/(snap|run|sys|proc|dev)(\/|$)|^\/System\/Volumes\/(?!Data$)|^\/private\/var\/vm/;
// macOS dev machines: only the real volumes (the server is Linux).
const MAC_KEEP = /^\/$|^\/System\/Volumes\/Data$|^\/Volumes\/(?!Recovery)/;
async function dfRows(args) {
  const { stdout } = await run('df', args, { timeout: 5000 });
  return stdout
    .trim()
    .split('\n')
    .slice(1)
    .map((l) => l.match(/^(.*?)\s+(\d+)\s+(\d+)\s+(\d+)\s+\d+%\s+(\/.*)$/))
    .filter(Boolean)
    .map((m) => ({ fs: m[1], a: Number(m[2]), b: Number(m[3]), c: Number(m[4]), mount: m[5] }))
    .filter((r) => !SKIP_FS.test(r.fs) && !SKIP_MOUNT.test(r.mount) && (isLinux || MAC_KEEP.test(r.mount)));
}
async function diskUsage() {
  const rows = await dfRows(['-kP']);
  const types = isLinux ? await fsTypes() : {};
  return rows.map((r) => ({
    fs: r.fs,
    type: types[r.mount] ?? null,
    mount: r.mount,
    size: r.a * 1024,
    used: r.b * 1024,
    free: r.c * 1024,
    percent: r.a ? ((r.a - r.c) / r.a) * 100 : 0,
  }));
}
async function fsTypes() {
  const out = {};
  for (const line of (await fs.readFile('/proc/mounts', 'utf8')).split('\n')) {
    const c = line.split(' ');
    if (c[1]) out[c[1].replace(/\\040/g, ' ')] = c[2];
  }
  return out;
}
async function inodeUsage() {
  if (!isLinux) return null;
  const rows = await dfRows(['-iP']);
  return rows.map((r) => ({ mount: r.mount, total: r.a, used: r.b, free: r.c, percent: r.a ? (r.b / r.a) * 100 : 0 }));
}

// ── disk I/O and network counters (Linux) ──
async function diskCounters() {
  if (!isLinux) return null;
  try {
    const out = {};
    for (const line of (await fs.readFile('/proc/diskstats', 'utf8')).split('\n')) {
      const c = line.trim().split(/\s+/);
      const name = c[2];
      // whole disks only (sda, vda, xvda, nvme0n1, mmcblk0) — not partitions, loops or dm
      if (!name || !/^(sd[a-z]+|vd[a-z]+|xvd[a-z]+|hd[a-z]+|nvme\d+n\d+|mmcblk\d+)$/.test(name)) continue;
      out[name] = {
        reads: Number(c[3]),
        readBytes: Number(c[5]) * 512,
        writes: Number(c[7]),
        writeBytes: Number(c[9]) * 512,
        busyMs: Number(c[12]),
      };
    }
    return out;
  } catch {
    return null;
  }
}
async function netCounters() {
  if (!isLinux) return null;
  try {
    const out = {};
    for (const line of (await fs.readFile('/proc/net/dev', 'utf8')).split('\n').slice(2)) {
      const [name, rest] = line.split(':');
      if (!rest) continue;
      const iface = name.trim();
      if (iface === 'lo') continue;
      const c = rest.trim().split(/\s+/).map(Number);
      out[iface] = { rxBytes: c[0], rxPackets: c[1], txBytes: c[8], txPackets: c[9], rxTotal: c[0], txTotal: c[8] };
    }
    return out;
  } catch {
    return null;
  }
}
/** Per-second rates between two counter readings, plus the running totals. */
function rates(a, b, seconds, keys) {
  if (!a || !b) return null;
  return Object.keys(b).map((name) => {
    const row = { name };
    for (const k of keys) row[k] = Math.max(0, (b[name][k] - (a[name]?.[k] ?? b[name][k])) / seconds);
    if ('busyMs' in b[name]) {
      row.busyPercent = Math.min(100, ((b[name].busyMs - (a[name]?.busyMs ?? 0)) / (seconds * 1000)) * 100);
    }
    if ('rxTotal' in b[name]) Object.assign(row, { rxTotal: b[name].rxTotal, txTotal: b[name].txTotal });
    return row;
  });
}

// ── processes, services, pm2 ──
async function topProcesses() {
  const args = isLinux
    ? ['-eo', 'pid,user:20,pcpu,pmem,rss,etimes,comm,args', '--sort=-pcpu', '--no-headers']
    : ['-Ao', 'pid,user,%cpu,%mem,rss,etime,comm', '-r'];
  const { stdout } = await run('ps', args, { timeout: 5000, maxBuffer: 4 * 1024 * 1024 });
  const lines = stdout.trim().split('\n');
  if (!isLinux) lines.shift();
  return lines.slice(0, 15).map((l) => {
    const c = l.trim().split(/\s+/);
    return {
      pid: Number(c[0]),
      user: c[1],
      cpu: Number(c[2]),
      mem: Number(c[3]),
      rss: Number(c[4]) * 1024,
      elapsed: isLinux ? Number(c[5]) : c[5],
      name: c[6],
      command: isLinux ? c.slice(7).join(' ').slice(0, 300) : c.slice(6).join(' ').slice(0, 300),
    };
  });
}
const SERVICES = ['nginx', 'auditd', 'mytrackhub-agent', 'ssh', 'cron'];
async function serviceStates() {
  if (!isLinux) return null;
  let stdout = '';
  try {
    ({ stdout } = await run('systemctl', ['is-active', ...SERVICES], { timeout: 5000 }));
  } catch (err) {
    stdout = err.stdout ?? ''; // non-zero exit when any is inactive
  }
  const states = stdout.trim().split('\n');
  return SERVICES.map((name, i) => ({ name, state: states[i] ?? 'unknown' }));
}
async function pm2Processes() {
  const { stdout } = await run('pm2', ['jlist'], { timeout: 8000, maxBuffer: 8 * 1024 * 1024 });
  const list = JSON.parse(stdout.slice(stdout.indexOf('[')));
  return list.map((p) => ({
    name: p.name,
    pid: p.pid,
    status: p.pm2_env?.status,
    cpu: p.monit?.cpu ?? null,
    memory: p.monit?.memory ?? null,
    restarts: p.pm2_env?.restart_time ?? 0,
    uptimeSince: p.pm2_env?.pm_uptime ? new Date(p.pm2_env.pm_uptime).toISOString() : null,
    mode: p.pm2_env?.exec_mode ?? null,
  }));
}

// ── this API, the database, the machine ──
function apiProcess() {
  const m = process.memoryUsage();
  return {
    pid: process.pid,
    node: process.version,
    env: config.env,
    uptime: process.uptime(),
    rss: m.rss,
    heapUsed: m.heapUsed,
    heapTotal: m.heapTotal,
    external: m.external,
  };
}
async function databasePing() {
  const started = performance.now();
  await sequelize.query('SELECT 1');
  return {
    dialect: config.db.dialect,
    host: config.db.host,
    name: config.db.name,
    latencyMs: Math.round((performance.now() - started) * 10) / 10,
  };
}
async function systemInfo() {
  let distro = null;
  if (isLinux) {
    try {
      const m = (await fs.readFile('/etc/os-release', 'utf8')).match(/^PRETTY_NAME="?([^"\n]+)"?/m);
      distro = m?.[1] ?? null;
    } catch {
      /* no os-release */
    }
  }
  return {
    hostname: os.hostname(),
    platform: process.platform,
    distro,
    kernel: os.release(),
    arch: os.arch(),
    uptime: os.uptime(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    time: new Date().toISOString(),
  };
}
