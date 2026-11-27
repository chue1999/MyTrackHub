<script setup lang="ts">
/**
 * Capacity history: the readings the API takes every few minutes (CPU, memory,
 * disk, load, network, API memory, DB round-trip), each with its date & time.
 * Range 24 h / 7 days / 30 days, averages and peaks, paging and Excel export.
 */
interface Reading {
  id: number
  host: string
  at: string
  cpu: number | null
  load1: number | null
  load5: number | null
  load15: number | null
  cores: number | null
  // BIGINT columns arrive as text from the database
  memTotal: number | string | null
  memUsed: number | string | null
  memAvailable: number | string | null
  memCache: number | string | null
  swapUsed: number | string | null
  diskMount: string | null
  diskSize: number | string | null
  diskUsed: number | string | null
  diskPercent: number | null
  netRx: number | null
  netTx: number | null
  apiRss: number | string | null
  dbLatencyMs: number | null
}
interface History {
  rows: Reading[]
  total: number
  intervalMinutes: number
  keepDays: number
  summary: Record<string, number | null>
}

const api = useApi()
const RANGES = [
  { value: 1, title: 'Last 24 hours' },
  { value: 7, title: 'Last 7 days' },
  { value: 30, title: 'Last 30 days' },
  { value: 90, title: 'Last 90 days' },
]
const days = ref(1)
const page = ref(1)
const pageSize = ref(50)

const range = () => ({
  from: new Date(Date.now() - days.value * 86_400_000).toISOString(),
  to: new Date().toISOString(),
})
const { data, pending, refresh } = await useAsyncData(
  'server-history',
  () => api<History>('/server/history', { query: { ...range(), page: page.value, pageSize: pageSize.value } }),
  { watch: [days, page, pageSize] },
)
watch(days, () => (page.value = 1))
// New readings arrive every few minutes: refresh quietly.
const timer = setInterval(() => page.value === 1 && refresh(), 60_000)
onBeforeUnmount(() => clearInterval(timer))

const n = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v))
const memPct = (r: Reading) => {
  const total = n(r.memTotal)
  const avail = n(r.memAvailable)
  return total && avail !== null ? ((total - avail) / total) * 100 : null
}
const level = (p: number | null) => (p === null ? 'grey' : p >= 90 ? 'error' : p >= 75 ? 'warning' : 'success')
const pct = (p: number | null) => (p === null ? '—' : `${p.toFixed(p < 10 ? 1 : 0)}%`)
const fullDate = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

const rows = computed(() => data.value?.rows ?? [])
const sum = computed(() => data.value?.summary ?? {})
const memTotal = computed(() => n(rows.value[0]?.memTotal))
const peaks = computed(() => [
  { label: 'CPU average', value: pct(sum.value.cpuAvg ?? null), sub: `peak ${pct(sum.value.cpuMax ?? null)}` },
  {
    label: 'Memory peak',
    value:
      memTotal.value && sum.value.memAvailableMin !== null && sum.value.memAvailableMin !== undefined
        ? pct(((memTotal.value - sum.value.memAvailableMin) / memTotal.value) * 100)
        : '—',
    sub: `programs up to ${formatBytes(sum.value.memUsedMax ?? null)}`,
  },
  { label: 'Disk peak', value: pct(sum.value.diskMax ?? null), sub: rows.value[0]?.diskMount ?? '/' },
  {
    label: 'Load average',
    value: sum.value.loadAvg !== null && sum.value.loadAvg !== undefined ? sum.value.loadAvg.toFixed(2) : '—',
    sub: `peak ${sum.value.loadMax?.toFixed(2) ?? '—'}`,
  },
  {
    label: 'DB round-trip peak',
    value: sum.value.dbMax !== null && sum.value.dbMax !== undefined ? `${Math.round(sum.value.dbMax)} ms` : '—',
    sub: `${sum.value.readings ?? 0} readings`,
  },
])

const headers = [
  { title: 'Date & time', key: 'at', sortable: false, width: 210 },
  { title: 'CPU', key: 'cpu', sortable: false },
  { title: 'Memory', key: 'mem', sortable: false },
  { title: 'Disk', key: 'disk', sortable: false },
  { title: 'Load 1/5/15', key: 'load', sortable: false },
  { title: 'Network in / out', key: 'net', sortable: false },
  { title: 'API memory', key: 'apiRss', sortable: false },
  { title: 'DB', key: 'db', sortable: false, align: 'end' as const },
]

// ── export ──
const exporting = ref(false)
const snack = reactive({ show: false, text: '', color: 'success' })
async function exportXlsx() {
  exporting.value = true
  try {
    const all: Reading[] = []
    for (let p = 1; ; p++) {
      const r = await api<History>('/server/history', { query: { ...range(), page: p, pageSize: 5000 } })
      all.push(...r.rows)
      if (!r.rows.length || all.length >= r.total || all.length >= 50_000) break
    }
    await exportExcel({
      title: 'Server capacity history',
      periodText: RANGES.find((r) => r.value === days.value)?.title ?? '',
      filtersText: all[0]?.host ?? '',
      columns: [
        { key: 'at', header: 'Date & time', type: 'date', width: 20 },
        { key: 'cpu', header: 'CPU %', type: 'number', width: 9 },
        { key: 'mem', header: 'Memory %', type: 'number', width: 11 },
        { key: 'memUsedMb', header: 'Programs (MB)', type: 'number', width: 14 },
        { key: 'memTotalMb', header: 'RAM total (MB)', type: 'number', width: 14 },
        { key: 'disk', header: 'Disk %', type: 'number', width: 9 },
        { key: 'load1', header: 'Load 1m', width: 9 },
        { key: 'load5', header: 'Load 5m', width: 9 },
        { key: 'load15', header: 'Load 15m', width: 9 },
        { key: 'rxKb', header: 'Net in (KB/s)', type: 'number', width: 13 },
        { key: 'txKb', header: 'Net out (KB/s)', type: 'number', width: 13 },
        { key: 'apiMb', header: 'API memory (MB)', type: 'number', width: 15 },
        { key: 'db', header: 'DB (ms)', type: 'number', width: 9 },
      ],
      rows: all.map((r) => ({
        at: new Date(r.at),
        cpu: r.cpu,
        mem: memPct(r) === null ? null : Math.round(memPct(r)!),
        memUsedMb: n(r.memUsed) === null ? null : Math.round(n(r.memUsed)! / 1048576),
        memTotalMb: n(r.memTotal) === null ? null : Math.round(n(r.memTotal)! / 1048576),
        disk: r.diskPercent,
        load1: r.load1,
        load5: r.load5,
        load15: r.load15,
        rxKb: r.netRx === null ? null : Math.round(r.netRx / 1024),
        txKb: r.netTx === null ? null : Math.round(r.netTx / 1024),
        apiMb: n(r.apiRss) === null ? null : Math.round(n(r.apiRss)! / 1048576),
        db: r.dbLatencyMs,
      })),
      summary: [
        { label: 'Readings', value: all.length },
        { label: 'CPU average %', value: Math.round(sum.value.cpuAvg ?? 0) },
        { label: 'CPU peak %', value: Math.round(sum.value.cpuMax ?? 0) },
        { label: 'Disk peak %', value: Math.round(sum.value.diskMax ?? 0) },
      ],
      fileName: `server-capacity-${new Date().toISOString().slice(0, 10)}.xlsx`,
    })
    Object.assign(snack, { show: true, text: `Exported ${all.length} readings`, color: 'success' })
  } catch (e) {
    Object.assign(snack, { show: true, text: errorMessage(e, 'Could not export'), color: 'error' })
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <section class="panel">
    <div class="d-flex flex-wrap align-center ga-3 mb-3">
      <h3 class="ma-0"><v-icon icon="mdi-history" size="20" />Capacity history</h3>
      <span class="text-caption text-medium-emphasis">
        One reading every {{ data?.intervalMinutes ?? 5 }} min · kept {{ data?.keepDays ?? 90 }} days
      </span>
      <v-spacer />
      <v-btn-toggle v-model="days" mandatory density="compact" variant="outlined" divided rounded="lg" color="primary">
        <v-btn v-for="r in RANGES" :key="r.value" :value="r.value" class="text-none" size="small">{{ r.title }}</v-btn>
      </v-btn-toggle>
      <v-btn
        size="small"
        color="success"
        variant="tonal"
        class="text-none"
        prepend-icon="mdi-microsoft-excel"
        :loading="exporting"
        :disabled="!data?.total"
        @click="exportXlsx"
        >Export</v-btn
      >
      <v-btn icon="mdi-refresh" variant="text" size="small" :loading="pending" @click="refresh()" />
    </div>

    <div class="peaks mb-4">
      <div v-for="p in peaks" :key="p.label" class="peak">
        <div class="text-caption text-medium-emphasis">{{ p.label }}</div>
        <div class="peak-val">{{ p.value }}</div>
        <div class="text-caption text-medium-emphasis">{{ p.sub }}</div>
      </div>
    </div>

    <v-data-table-server
      v-model:page="page"
      v-model:items-per-page="pageSize"
      :headers="headers"
      :items="rows"
      :items-length="data?.total ?? 0"
      :loading="pending"
      :items-per-page-options="[25, 50, 100, 200]"
      density="compact"
      class="bg-transparent"
    >
      <template #item.at="{ item }">
        <span class="text-mono text-body-2">{{ fullDate(item.at) }}</span>
      </template>
      <template #item.cpu="{ item }">
        <div class="cell-bar">
          <v-progress-linear :model-value="item.cpu ?? 0" :color="level(item.cpu)" height="6" rounded />
          <span>{{ pct(item.cpu) }}</span>
        </div>
      </template>
      <template #item.mem="{ item }">
        <div class="cell-bar">
          <v-progress-linear :model-value="memPct(item) ?? 0" :color="level(memPct(item))" height="6" rounded />
          <span>{{ pct(memPct(item)) }}</span>
        </div>
        <div class="text-caption text-medium-emphasis">
          {{ formatBytes(n(item.memUsed)) }} / {{ formatBytes(n(item.memTotal)) }}
        </div>
      </template>
      <template #item.disk="{ item }">
        <div class="cell-bar">
          <v-progress-linear :model-value="item.diskPercent ?? 0" :color="level(item.diskPercent)" height="6" rounded />
          <span>{{ pct(item.diskPercent) }}</span>
        </div>
      </template>
      <template #item.load="{ item }">
        <span class="text-mono text-body-2"
          >{{ item.load1?.toFixed(2) ?? '—' }} / {{ item.load5?.toFixed(2) ?? '—' }} /
          {{ item.load15?.toFixed(2) ?? '—' }}</span
        >
      </template>
      <template #item.net="{ item }">
        <span class="text-body-2">{{ formatBytes(item.netRx) }}/s · {{ formatBytes(item.netTx) }}/s</span>
      </template>
      <template #item.apiRss="{ item }">{{ formatBytes(n(item.apiRss)) }}</template>
      <template #item.db="{ item }">{{ item.dbLatencyMs !== null ? `${item.dbLatencyMs} ms` : '—' }}</template>
      <template #no-data>
        <div class="py-8 text-medium-emphasis">
          No readings yet — the first one is taken about 20 seconds after the API starts, then every
          {{ data?.intervalMinutes ?? 5 }} minutes.
        </div>
      </template>
    </v-data-table-server>

    <v-snackbar v-model="snack.show" :color="snack.color" location="top" timeout="2500">{{ snack.text }}</v-snackbar>
  </section>
</template>

<style scoped>
.panel {
  padding: 18px 20px;
  border-radius: 18px;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  min-width: 0;
  overflow-x: auto;
}
.panel h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1rem;
  font-weight: 800;
}
.peaks {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}
@media (max-width: 1000px) {
  .peaks {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.peak {
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.peak-val {
  font-size: 1.25rem;
  font-weight: 800;
}
.cell-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 110px;
}
.cell-bar span {
  width: 40px;
  font-size: 0.8rem;
  text-align: right;
}
</style>
