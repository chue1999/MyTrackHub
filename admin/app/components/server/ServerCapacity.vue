<script setup lang="ts">
/**
 * Capacity of the server running the API + website: CPU, memory, disks, disk
 * I/O, network, services, PM2, top processes, the API process and the database
 * round-trip. Refreshes every few seconds while "Live" is on.
 */
interface Status {
  at: string
  system: {
    hostname: string
    platform: string
    distro: string | null
    kernel: string
    arch: string
    uptime: number
    timezone: string
  } | null
  cpu: { model: string | null; speedMHz: number | null; cores: number; usage: number; perCore: number[] }
  load: { avg: number[]; cores: number }
  memory: {
    total: number
    used: number
    free: number
    available: number
    buffers: number | null
    cached: number | null
    shared?: number | null
    dirty?: number | null
    swapTotal: number | null
    swapUsed: number | null
  } | null
  disks:
    | {
        fs: string
        type: string | null
        mount: string
        size: number
        used: number
        free: number
        percent: number
        inodes: { total: number; used: number; percent: number } | null
      }[]
    | null
  diskIo:
    | { name: string; readBytes: number; writeBytes: number; reads: number; writes: number; busyPercent?: number }[]
    | null
  network:
    | {
        name: string
        rxBytes: number
        txBytes: number
        rxPackets: number
        txPackets: number
        rxTotal?: number
        txTotal?: number
      }[]
    | null
  processes:
    | {
        pid: number
        user: string
        cpu: number
        mem: number
        rss: number
        elapsed: number | string
        name: string
        command: string
      }[]
    | null
  services: { name: string; state: string }[] | null
  pm2:
    | {
        name: string
        pid: number
        status: string
        cpu: number | null
        memory: number | null
        restarts: number
        uptimeSince: string | null
        mode: string | null
      }[]
    | null
  api: {
    pid: number
    node: string
    env: string
    uptime: number
    rss: number
    heapUsed: number
    heapTotal: number
    external: number
  }
  database: { dialect: string; host: string; name: string; latencyMs: number } | null
}

const api = useApi()
const status = ref<Status | null>(null)
const error = ref('')
const loading = ref(false)
const live = ref(true)
const INTERVAL = 5000

async function load() {
  if (loading.value) return
  loading.value = true
  try {
    status.value = await api<Status>('/server/status')
    error.value = ''
  } catch (e) {
    error.value = errorMessage(e, 'Could not read the server status')
  } finally {
    loading.value = false
  }
}
let timer: ReturnType<typeof setInterval> | undefined
watch(
  live,
  (on) => {
    clearInterval(timer)
    if (on) timer = setInterval(load, INTERVAL)
  },
  { immediate: true },
)
onMounted(load)
onBeforeUnmount(() => clearInterval(timer))

const s = computed(() => status.value)
const pct = (v: number, total: number) => (total ? (v / total) * 100 : 0)
const level = (p: number) => (p >= 90 ? 'error' : p >= 75 ? 'warning' : 'success')
const fmtPct = (p: number) => `${p.toFixed(p < 10 ? 1 : 0)}%`
const rate = (n: number) => `${formatBytes(n)}/s`

const memPct = computed(() =>
  s.value?.memory ? pct(s.value.memory.total - s.value.memory.available, s.value.memory.total) : 0,
)
const rootDisk = computed(() => s.value?.disks?.find((d) => d.mount === '/') ?? s.value?.disks?.[0] ?? null)
const loadPct = computed(() => (s.value ? (s.value.load.avg[0]! / Math.max(1, s.value.load.cores)) * 100 : 0))

const gauges = computed(() => {
  if (!s.value) return []
  const m = s.value.memory
  return [
    {
      label: 'CPU',
      value: s.value.cpu.usage,
      icon: 'mdi-cpu-64-bit',
      sub: `${s.value.cpu.cores} cores`,
    },
    {
      label: 'Memory',
      value: memPct.value,
      icon: 'mdi-memory',
      sub: m ? `${formatBytes(m.total - m.available)} of ${formatBytes(m.total)}` : '—',
    },
    {
      label: `Disk ${rootDisk.value?.mount ?? ''}`,
      value: rootDisk.value?.percent ?? 0,
      icon: 'mdi-harddisk',
      sub: rootDisk.value ? `${formatBytes(rootDisk.value.free)} free of ${formatBytes(rootDisk.value.size)}` : '—',
    },
    {
      label: 'Load (1 min)',
      value: Math.min(100, loadPct.value),
      icon: 'mdi-speedometer',
      sub: `${s.value.load.avg.map((v) => v.toFixed(2)).join(' · ')} (1/5/15 min)`,
      text: s.value.load.avg[0]!.toFixed(2),
    },
  ]
})

// memory bar segments
const memSegments = computed(() => {
  const m = s.value?.memory
  if (!m) return []
  const cache = (m.cached ?? 0) + (m.buffers ?? 0)
  return [
    { label: 'Programs', value: m.used, color: '#2f80ed' },
    { label: 'Cache & buffers', value: cache, color: '#f2b400' },
    { label: 'Free', value: Math.max(0, m.total - m.used - cache), color: 'rgba(127,127,127,0.25)' },
  ]
})

const serviceColor = (st: string) =>
  st === 'active' ? 'success' : st === 'inactive' || st === 'unknown' ? 'grey' : 'error'
const elapsed = (v: number | string) => (typeof v === 'number' ? formatDuration(v) : v)
</script>

<template>
  <div>
    <!-- machine line -->
    <div class="machine mb-5">
      <div class="machine-ico"><v-icon icon="mdi-server" size="26" /></div>
      <div class="min-w-0 flex-grow-1">
        <div class="text-h6 font-weight-bold">{{ s?.system?.hostname ?? 'Server' }}</div>
        <div class="text-caption text-medium-emphasis">
          <template v-if="s?.system">
            {{ s.system.distro || s.system.platform }} · kernel {{ s.system.kernel }} · {{ s.system.arch }} · up
            {{ formatDuration(s.system.uptime) }} · {{ s.system.timezone }}
          </template>
          <template v-else>Reading…</template>
        </div>
      </div>
      <div class="d-flex align-center ga-2">
        <span v-if="s" class="text-caption text-medium-emphasis">Updated {{ formatTime(s.at) }}</span>
        <v-switch v-model="live" color="success" density="compact" hide-details inset label="Live" />
        <v-btn icon="mdi-refresh" variant="text" :loading="loading" @click="load" />
      </div>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" rounded="lg" class="mb-4" :text="error" />

    <template v-if="s">
      <!-- headline gauges -->
      <div class="gauges mb-5">
        <div v-for="g in gauges" :key="g.label" class="gauge">
          <v-progress-circular :model-value="g.value" :color="level(g.value)" size="86" width="9">
            <span class="gauge-val">{{ g.text ?? fmtPct(g.value) }}</span>
          </v-progress-circular>
          <div class="min-w-0">
            <div class="d-flex align-center ga-1 font-weight-bold">
              <v-icon :icon="g.icon" size="18" />{{ g.label }}
            </div>
            <div class="text-caption text-medium-emphasis">{{ g.sub }}</div>
          </div>
        </div>
      </div>

      <div class="grid">
        <!-- CPU -->
        <section class="panel">
          <h3><v-icon icon="mdi-cpu-64-bit" size="20" />CPU</h3>
          <div class="kv">
            <div>
              <span>Model</span><strong>{{ s.cpu.model || '—' }}</strong>
            </div>
            <div>
              <span>Cores</span><strong>{{ s.cpu.cores }}</strong>
            </div>
            <div>
              <span>Speed</span><strong>{{ s.cpu.speedMHz ? `${s.cpu.speedMHz} MHz` : '—' }}</strong>
            </div>
            <div>
              <span>Load 1 / 5 / 15 min</span><strong>{{ s.load.avg.map((v) => v.toFixed(2)).join(' / ') }}</strong>
            </div>
          </div>
          <div class="text-overline mt-3">Per core</div>
          <div class="cores">
            <div v-for="(c, i) in s.cpu.perCore" :key="i" class="core">
              <span class="core-n">{{ i }}</span>
              <v-progress-linear :model-value="c" :color="level(c)" height="8" rounded />
              <span class="core-v">{{ c.toFixed(0) }}%</span>
            </div>
          </div>
        </section>

        <!-- Memory -->
        <section class="panel">
          <h3><v-icon icon="mdi-memory" size="20" />Memory</h3>
          <template v-if="s.memory">
            <div class="stack mb-2">
              <div
                v-for="seg in memSegments"
                :key="seg.label"
                :style="{ width: `${pct(seg.value, s.memory.total)}%`, background: seg.color }"
                :title="`${seg.label}: ${formatBytes(seg.value)}`"
              />
            </div>
            <div class="legend mb-3">
              <span v-for="seg in memSegments" :key="seg.label"
                ><i :style="{ background: seg.color }" />{{ seg.label }}
                <strong>{{ formatBytes(seg.value) }}</strong></span
              >
            </div>
            <div class="kv">
              <div>
                <span>Total</span><strong>{{ formatBytes(s.memory.total) }}</strong>
              </div>
              <div>
                <span>Available</span><strong>{{ formatBytes(s.memory.available) }}</strong>
              </div>
              <div>
                <span>Page cache</span><strong>{{ formatBytes(s.memory.cached) }}</strong>
              </div>
              <div>
                <span>Buffers</span><strong>{{ formatBytes(s.memory.buffers) }}</strong>
              </div>
              <div>
                <span>Shared</span><strong>{{ formatBytes(s.memory.shared) }}</strong>
              </div>
              <div>
                <span>Dirty (unwritten)</span><strong>{{ formatBytes(s.memory.dirty) }}</strong>
              </div>
            </div>
            <div v-if="s.memory.swapTotal" class="mt-3">
              <div class="d-flex justify-space-between text-caption mb-1">
                <span>Swap</span
                ><span>{{ formatBytes(s.memory.swapUsed) }} / {{ formatBytes(s.memory.swapTotal) }}</span>
              </div>
              <v-progress-linear
                :model-value="pct(s.memory.swapUsed ?? 0, s.memory.swapTotal)"
                :color="level(pct(s.memory.swapUsed ?? 0, s.memory.swapTotal))"
                height="8"
                rounded
              />
            </div>
          </template>
          <div v-else class="text-medium-emphasis">Not available</div>
        </section>

        <!-- Disks -->
        <section class="panel wide">
          <h3><v-icon icon="mdi-harddisk" size="20" />Disks</h3>
          <v-table density="compact" class="bg-transparent">
            <thead>
              <tr>
                <th>Mount</th>
                <th>Device</th>
                <th class="text-right">Size</th>
                <th class="text-right">Used</th>
                <th class="text-right">Free</th>
                <th style="min-width: 160px">Usage</th>
                <th style="min-width: 120px">Inodes</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in s.disks ?? []" :key="d.mount">
                <td class="font-weight-bold text-mono">{{ d.mount }}</td>
                <td class="text-caption">
                  {{ d.fs }}<span v-if="d.type"> · {{ d.type }}</span>
                </td>
                <td class="text-right">{{ formatBytes(d.size) }}</td>
                <td class="text-right">{{ formatBytes(d.used) }}</td>
                <td class="text-right">{{ formatBytes(d.free) }}</td>
                <td>
                  <div class="d-flex align-center ga-2">
                    <v-progress-linear :model-value="d.percent" :color="level(d.percent)" height="8" rounded />
                    <span class="text-caption" style="width: 38px">{{ fmtPct(d.percent) }}</span>
                  </div>
                </td>
                <td>
                  <div v-if="d.inodes" class="d-flex align-center ga-2">
                    <v-progress-linear
                      :model-value="d.inodes.percent"
                      :color="level(d.inodes.percent)"
                      height="6"
                      rounded
                    />
                    <span class="text-caption" style="width: 38px">{{ fmtPct(d.inodes.percent) }}</span>
                  </div>
                  <span v-else class="text-caption text-medium-emphasis">—</span>
                </td>
              </tr>
            </tbody>
          </v-table>
        </section>

        <!-- Disk I/O -->
        <section class="panel">
          <h3><v-icon icon="mdi-swap-vertical-bold" size="20" />Disk activity</h3>
          <v-table v-if="s.diskIo?.length" density="compact" class="bg-transparent">
            <thead>
              <tr>
                <th>Disk</th>
                <th class="text-right">Read</th>
                <th class="text-right">Write</th>
                <th class="text-right">IOPS</th>
                <th class="text-right">Busy</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in s.diskIo" :key="d.name">
                <td class="text-mono font-weight-bold">{{ d.name }}</td>
                <td class="text-right">{{ rate(d.readBytes) }}</td>
                <td class="text-right">{{ rate(d.writeBytes) }}</td>
                <td class="text-right">{{ Math.round(d.reads + d.writes) }}</td>
                <td class="text-right">{{ fmtPct(d.busyPercent ?? 0) }}</td>
              </tr>
            </tbody>
          </v-table>
          <div v-else class="text-caption text-medium-emphasis">Available on the Linux server.</div>
        </section>

        <!-- Network -->
        <section class="panel">
          <h3><v-icon icon="mdi-lan" size="20" />Network</h3>
          <v-table v-if="s.network?.length" density="compact" class="bg-transparent">
            <thead>
              <tr>
                <th>Interface</th>
                <th class="text-right">In</th>
                <th class="text-right">Out</th>
                <th class="text-right">Total in / out</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="n in s.network" :key="n.name">
                <td class="text-mono font-weight-bold">{{ n.name }}</td>
                <td class="text-right">{{ rate(n.rxBytes) }}</td>
                <td class="text-right">{{ rate(n.txBytes) }}</td>
                <td class="text-right text-caption">{{ formatBytes(n.rxTotal) }} / {{ formatBytes(n.txTotal) }}</td>
              </tr>
            </tbody>
          </v-table>
          <div v-else class="text-caption text-medium-emphasis">Available on the Linux server.</div>
        </section>

        <!-- Services + API + DB -->
        <section class="panel">
          <h3><v-icon icon="mdi-cogs" size="20" />Services</h3>
          <div v-if="s.services" class="d-flex flex-wrap ga-2 mb-4">
            <v-chip
              v-for="sv in s.services"
              :key="sv.name"
              :color="serviceColor(sv.state)"
              variant="tonal"
              size="small"
              :prepend-icon="sv.state === 'active' ? 'mdi-check-circle' : 'mdi-close-circle'"
              >{{ sv.name }} · {{ sv.state }}</v-chip
            >
          </div>
          <div v-else class="text-caption text-medium-emphasis mb-4">Available on the Linux server.</div>
          <div class="text-overline">This API</div>
          <div class="kv">
            <div>
              <span>Node</span><strong>{{ s.api.node }}</strong>
            </div>
            <div>
              <span>PID</span><strong>{{ s.api.pid }}</strong>
            </div>
            <div>
              <span>Running for</span><strong>{{ formatDuration(s.api.uptime) }}</strong>
            </div>
            <div>
              <span>Memory (RSS)</span><strong>{{ formatBytes(s.api.rss) }}</strong>
            </div>
            <div>
              <span>Heap</span><strong>{{ formatBytes(s.api.heapUsed) }} / {{ formatBytes(s.api.heapTotal) }}</strong>
            </div>
            <div>
              <span>Mode</span><strong>{{ s.api.env }}</strong>
            </div>
          </div>
          <div class="text-overline mt-3">Database</div>
          <div v-if="s.database" class="kv">
            <div>
              <span>Type</span><strong>{{ s.database.dialect === 'mssql' ? 'SQL Server' : 'PostgreSQL' }}</strong>
            </div>
            <div>
              <span>Host</span><strong class="text-mono">{{ s.database.host }}</strong>
            </div>
            <div>
              <span>Database</span><strong>{{ s.database.name }}</strong>
            </div>
            <div>
              <span>Round-trip</span
              ><strong
                :class="
                  s.database.latencyMs > 200
                    ? 'text-error'
                    : s.database.latencyMs > 50
                      ? 'text-warning'
                      : 'text-success'
                "
                >{{ s.database.latencyMs }} ms</strong
              >
            </div>
          </div>
          <div v-else class="text-error text-body-2">Database not reachable</div>
        </section>

        <!-- PM2 -->
        <section class="panel">
          <h3><v-icon icon="mdi-application-cog-outline" size="20" />PM2 processes</h3>
          <v-table v-if="s.pm2?.length" density="compact" class="bg-transparent">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th class="text-right">CPU</th>
                <th class="text-right">Memory</th>
                <th class="text-right">Restarts</th>
                <th class="text-right">Up since</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in s.pm2" :key="p.name + p.pid">
                <td class="font-weight-bold">{{ p.name }}</td>
                <td>
                  <v-chip size="x-small" :color="p.status === 'online' ? 'success' : 'error'" variant="tonal">{{
                    p.status
                  }}</v-chip>
                </td>
                <td class="text-right">{{ p.cpu ?? '—' }}%</td>
                <td class="text-right">{{ formatBytes(p.memory) }}</td>
                <td class="text-right" :class="p.restarts > 10 ? 'text-warning font-weight-bold' : ''">
                  {{ p.restarts }}
                </td>
                <td class="text-right text-caption">{{ p.uptimeSince ? timeAgo(p.uptimeSince) : '—' }}</td>
              </tr>
            </tbody>
          </v-table>
          <div v-else class="text-caption text-medium-emphasis">PM2 not found for the API's user.</div>
        </section>

        <!-- top processes -->
        <section class="panel wide">
          <h3><v-icon icon="mdi-format-list-numbered" size="20" />Top processes (by CPU)</h3>
          <v-table v-if="s.processes?.length" density="compact" class="bg-transparent">
            <thead>
              <tr>
                <th>PID</th>
                <th>User</th>
                <th class="text-right">CPU</th>
                <th class="text-right">Mem</th>
                <th class="text-right">RSS</th>
                <th class="text-right">Running</th>
                <th>Command</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in s.processes" :key="p.pid">
                <td class="text-mono">{{ p.pid }}</td>
                <td>{{ p.user }}</td>
                <td class="text-right" :class="p.cpu > 50 ? 'text-error font-weight-bold' : ''">
                  {{ p.cpu.toFixed(1) }}%
                </td>
                <td class="text-right">{{ p.mem.toFixed(1) }}%</td>
                <td class="text-right">{{ formatBytes(p.rss) }}</td>
                <td class="text-right text-caption">{{ elapsed(p.elapsed) }}</td>
                <td class="cmd" :title="p.command">
                  <strong>{{ p.name }}</strong> <span class="text-medium-emphasis">{{ p.command }}</span>
                </td>
              </tr>
            </tbody>
          </v-table>
        </section>
      </div>
    </template>
    <div v-else-if="!error" class="d-flex justify-center py-16">
      <v-progress-circular indeterminate color="primary" />
    </div>
  </div>
</template>

<style scoped>
.min-w-0 {
  min-width: 0;
}
.machine {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border-radius: 18px;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
.machine-ico {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: #fff;
  background: linear-gradient(135deg, #2f80ed, #1c5fc4);
}
.gauges {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
@media (max-width: 1100px) {
  .gauges {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 560px) {
  .gauges {
    grid-template-columns: 1fr;
  }
}
.gauge {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 18px;
  border-radius: 18px;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
.gauge-val {
  font-weight: 800;
  font-size: 1rem;
  color: rgb(var(--v-theme-on-surface));
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
@media (max-width: 1000px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
.panel {
  padding: 18px 20px;
  border-radius: 18px;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  min-width: 0;
  overflow-x: auto;
}
.panel.wide {
  grid-column: 1 / -1;
}
.panel h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1rem;
  font-weight: 800;
  margin-bottom: 12px;
}
.kv {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
}
.kv > div {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.kv span {
  font-size: 0.72rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.kv strong {
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cores {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 6px 16px;
}
.core {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
}
.core-n {
  width: 18px;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.core-v {
  width: 34px;
  text-align: right;
}
.stack {
  display: flex;
  height: 14px;
  border-radius: 7px;
  overflow: hidden;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  font-size: 0.8rem;
}
.legend i {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 3px;
  margin-right: 6px;
  vertical-align: -1px;
}
.cmd {
  max-width: 520px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.78rem;
}
</style>
