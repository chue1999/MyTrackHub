<script setup lang="ts">
/**
 * Server logs — what happened on the Linux server itself (SSH, sudo, su,
 * account changes, file deletes/changes, audit tampering, cache clearing).
 * Sent by deploy/server-agent. Read-only: there is no delete.
 */
interface ServerLogRow {
  id: number
  host: string
  at: string
  type: string
  user: string | null
  runAs: string | null
  sourceIp: string | null
  success: boolean
  summary: string | null
  detail: Record<string, unknown> | null
}
interface Page {
  rows: ServerLogRow[]
  total: number
}
interface Agent {
  host: string
  agentVersion: string | null
  lastSeenAt: string
  lastIp: string | null
  auditd: boolean | null
  silent: boolean
}
interface Summary {
  loginsToday: number
  failedLoginsToday: number
  sudoToday: number
  deletesToday: number
  tamperToday: number
  configured: boolean
  agents: Agent[]
}

const api = useApi()

const META: Record<string, { label: string; icon: string; color: string }> = {
  login_ok: { label: 'SSH sign-in', icon: 'mdi-login-variant', color: 'success' },
  login_fail: { label: 'SSH sign-in failed', icon: 'mdi-lock-alert-outline', color: 'error' },
  logout: { label: 'SSH sign-out', icon: 'mdi-logout-variant', color: 'grey' },
  sudo: { label: 'sudo', icon: 'mdi-shield-crown-outline', color: 'warning' },
  su: { label: 'su (switch user)', icon: 'mdi-account-switch-outline', color: 'warning' },
  account_change: { label: 'User / group change', icon: 'mdi-account-edit-outline', color: 'deep-purple' },
  file_delete: { label: 'File deleted', icon: 'mdi-file-remove-outline', color: 'error' },
  file_change: { label: 'File changed', icon: 'mdi-file-edit-outline', color: 'info' },
  audit_tamper: { label: 'Auditing touched', icon: 'mdi-shield-alert-outline', color: 'error' },
  agent_start: { label: 'Agent started', icon: 'mdi-play-circle-outline', color: 'success' },
  agent_stop: { label: 'Agent stopped', icon: 'mdi-stop-circle-outline', color: 'error' },
  maintenance: { label: 'Cache clearing', icon: 'mdi-broom', color: 'teal' },
}
const meta = (t: string) => META[t] ?? { label: t, icon: 'mdi-circle-small', color: 'grey' }

const GROUPS = [
  { value: 'all', title: 'All', icon: 'mdi-format-list-bulleted' },
  { value: 'logins', title: 'Sign-ins', icon: 'mdi-login-variant' },
  { value: 'failed', title: 'Failed / refused', icon: 'mdi-alert-circle-outline' },
  { value: 'sudo', title: 'sudo / su', icon: 'mdi-shield-crown-outline' },
  { value: 'files', title: 'Files', icon: 'mdi-file-document-multiple-outline' },
  { value: 'accounts', title: 'Accounts', icon: 'mdi-account-edit-outline' },
  { value: 'tamper', title: 'Tampering', icon: 'mdi-shield-alert-outline' },
  { value: 'maintenance', title: 'Cache clearing', icon: 'mdi-broom' },
]

const search = ref('')
const group = ref<string>('all')
const host = ref<string | null>(null)
const page = ref(1)
const pageSize = ref(50)

const { data: summary, refresh: refreshSummary } = await useAsyncData('server-log-summary', () =>
  api<Summary>('/server-logs/summary'),
)
const query = computed(() => ({
  search: search.value || undefined,
  group: group.value === 'all' ? undefined : group.value,
  host: host.value || undefined,
}))
const { data, pending, refresh } = await useAsyncData(
  'server-logs',
  () => api<Page>('/server-logs', { query: { ...query.value, page: page.value, pageSize: pageSize.value } }),
  { watch: [page, pageSize] },
)
let t: ReturnType<typeof setTimeout>
watch([search, group, host], () => {
  clearTimeout(t)
  t = setTimeout(() => {
    page.value = 1
    refresh()
  }, 300)
})
function reload() {
  refresh()
  refreshSummary()
}
// Keep it fresh while the tab is open.
const timer = setInterval(() => {
  if (page.value === 1) reload()
}, 30_000)
onBeforeUnmount(() => clearInterval(timer))

const rows = computed(() => data.value?.rows ?? [])
const total = computed(() => data.value?.total ?? 0)
const agents = computed(() => summary.value?.agents ?? [])
const headers = [
  { title: 'Time', key: 'at', sortable: false, width: 150 },
  { title: 'What happened', key: 'type', sortable: false },
  { title: 'Who', key: 'user', sortable: false, width: 170 },
  { title: 'From', key: 'sourceIp', sortable: false, width: 150 },
]

const tiles = computed(() => [
  { label: 'SSH sign-ins today', value: summary.value?.loginsToday ?? 0, icon: 'mdi-login-variant', tone: 'green' },
  {
    label: 'Failed sign-ins today',
    value: summary.value?.failedLoginsToday ?? 0,
    icon: 'mdi-lock-alert-outline',
    tone: 'red',
  },
  { label: 'sudo / su today', value: summary.value?.sudoToday ?? 0, icon: 'mdi-shield-crown-outline', tone: 'amber' },
  {
    label: 'File deletes today',
    value: summary.value?.deletesToday ?? 0,
    icon: 'mdi-file-remove-outline',
    tone: 'teal',
  },
])

// ── detail dialog ──
const open = ref<ServerLogRow | null>(null)
function openRow(_e: unknown, { item }: { item: ServerLogRow }) {
  open.value = item
}
const pretty = (v: unknown) => JSON.stringify(v, null, 2)

// ── export ──
const snack = reactive({ show: false, text: '', color: 'success' })
const toast = (text: string, color = 'success') => Object.assign(snack, { show: true, text, color })
const exporting = ref(false)
async function exportXlsx() {
  exporting.value = true
  try {
    const all: ServerLogRow[] = []
    let grand = 0
    for (let p = 1; ; p++) {
      const r = await api<Page>('/server-logs', { query: { ...query.value, page: p, pageSize: 5000 } })
      grand = r.total
      all.push(...r.rows)
      if (!r.rows.length || all.length >= grand || all.length >= 50_000) break
    }
    await exportExcel({
      title: 'Server logs',
      periodText: all.length ? `${formatDateTime(all.at(-1)!.at)} – ${formatDateTime(all[0]!.at)}` : 'all time',
      filtersText: [
        group.value !== 'all' ? GROUPS.find((g) => g.value === group.value)?.title : '',
        host.value ? `Server: ${host.value}` : '',
        search.value ? `Search: ${search.value}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
      columns: [
        { key: 'at', header: 'Time', type: 'date', width: 20 },
        { key: 'host', header: 'Server', width: 18 },
        { key: 'what', header: 'What happened', width: 22 },
        { key: 'result', header: 'Result', type: 'result', width: 10 },
        { key: 'user', header: 'Who', width: 16 },
        { key: 'runAs', header: 'Ran as', width: 12 },
        { key: 'sourceIp', header: 'From IP', width: 16 },
        { key: 'summary', header: 'Details', width: 80 },
      ],
      rows: all.map((r) => ({
        at: new Date(r.at),
        host: r.host,
        what: meta(r.type).label,
        result: r.success ? 'Success' : 'Failed',
        user: r.user ?? '',
        runAs: r.runAs ?? '',
        sourceIp: r.sourceIp ?? '',
        summary: r.summary ?? '',
      })),
      summary: [
        { label: 'Entries', value: all.length },
        { label: 'SSH sign-ins', value: all.filter((r) => r.type === 'login_ok').length },
        { label: 'Failed sign-ins', value: all.filter((r) => r.type === 'login_fail').length },
        { label: 'sudo / su', value: all.filter((r) => r.type === 'sudo' || r.type === 'su').length },
        { label: 'File deletes', value: all.filter((r) => r.type === 'file_delete').length },
        { label: 'Tampering', value: all.filter((r) => r.type === 'audit_tamper' || r.type === 'agent_stop').length },
      ],
      fileName: `server-logs-${new Date().toISOString().slice(0, 10)}.xlsx`,
      truncatedFrom: grand > 50_000 ? grand : null,
    })
    toast(`Exported ${all.length.toLocaleString()} entries`)
  } catch (e) {
    toast(errorMessage(e, 'Could not export'), 'error')
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div>
    <div class="d-flex align-center ga-3 mb-3">
      <div class="text-body-2 text-medium-emphasis">
        Sign-ins, sudo, account changes and file deletes on the servers themselves
      </div>
      <v-spacer />
      <v-btn icon="mdi-refresh" variant="text" :loading="pending" @click="reload" />
    </div>

    <!-- agent health -->
    <v-alert
      v-if="summary && !summary.configured"
      type="warning"
      variant="tonal"
      rounded="lg"
      class="mb-4"
      icon="mdi-server-off"
      title="Server agent not set up"
      text="Set SERVER_AGENT_KEY in the API settings and install the agent on the server (deploy/server-agent/INSTALL.md)."
    />
    <v-alert
      v-else-if="summary && !agents.length"
      type="info"
      variant="tonal"
      rounded="lg"
      class="mb-4"
      icon="mdi-server-network"
      text="No server has reported yet. Install the agent on the server (deploy/server-agent/INSTALL.md)."
    />
    <div v-else class="agents mb-4">
      <div v-for="a in agents" :key="a.host" class="agent" :class="{ bad: a.silent || a.auditd === false }">
        <v-icon :icon="a.silent ? 'mdi-server-off' : 'mdi-server'" size="22" />
        <div class="min-w-0">
          <div class="font-weight-bold">{{ a.host }}</div>
          <div class="text-caption">
            <template v-if="a.silent">Silent since {{ timeAgo(a.lastSeenAt) }} — agent stopped or server down</template>
            <template v-else>Reporting · last {{ timeAgo(a.lastSeenAt) }}</template>
            · auditd
            <strong :class="a.auditd === false ? 'text-error' : ''">{{
              a.auditd === null ? '?' : a.auditd ? 'on' : 'OFF'
            }}</strong>
            <span v-if="a.agentVersion"> · v{{ a.agentVersion }}</span>
          </div>
        </div>
      </div>
      <div v-if="summary?.tamperToday" class="agent bad">
        <v-icon icon="mdi-shield-alert" size="22" />
        <div>
          <div class="font-weight-bold">{{ summary.tamperToday }} tampering event(s) today</div>
          <button class="text-caption link" @click="group = 'tamper'">Show them</button>
        </div>
      </div>
    </div>

    <div class="tiles mb-5">
      <div v-for="tile in tiles" :key="tile.label" class="tile" :class="`tone-${tile.tone}`">
        <div class="tile-icon"><v-icon :icon="tile.icon" size="22" /></div>
        <div>
          <div class="tile-value">{{ tile.value.toLocaleString() }}</div>
          <div class="tile-label">{{ tile.label }}</div>
        </div>
      </div>
    </div>

    <v-card class="bordered">
      <div class="pa-3 d-flex flex-column ga-3">
        <v-chip-group v-model="group" mandatory selected-class="text-primary" column>
          <v-chip
            v-for="g in GROUPS"
            :key="g.title"
            :value="g.value"
            :prepend-icon="g.icon"
            variant="tonal"
            size="small"
          >
            {{ g.title }}
          </v-chip>
        </v-chip-group>
        <div class="d-flex flex-wrap align-center ga-2">
          <v-text-field
            v-model="search"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            prepend-inner-icon="mdi-magnify"
            placeholder="User, IP, command or file…"
            style="max-width: 320px"
          />
          <v-select
            v-if="agents.length > 1"
            v-model="host"
            :items="[{ title: 'All servers', value: null }, ...agents.map((a) => ({ title: a.host, value: a.host }))]"
            density="compact"
            variant="outlined"
            hide-details
            style="max-width: 220px"
          />
          <v-spacer />
          <span class="text-caption text-medium-emphasis">{{ total.toLocaleString() }} entries</span>
          <v-btn
            size="small"
            color="success"
            variant="tonal"
            class="text-none"
            prepend-icon="mdi-microsoft-excel"
            :loading="exporting"
            :disabled="!total"
            @click="exportXlsx"
          >
            Export
          </v-btn>
        </div>
      </div>
      <v-divider />

      <v-data-table-server
        v-model:page="page"
        v-model:items-per-page="pageSize"
        :headers="headers"
        :items="rows"
        :items-length="total"
        :loading="pending"
        :items-per-page-options="[25, 50, 100, 200]"
        item-value="id"
        hover
        density="comfortable"
        class="clickable"
        @click:row="openRow"
      >
        <template #item.at="{ item }">
          <div class="py-2">
            <div class="text-body-2 font-weight-bold text-mono">{{ formatTime(item.at) }}</div>
            <div class="text-caption text-medium-emphasis">{{ formatDay(item.at) }}</div>
          </div>
        </template>
        <template #item.type="{ item }">
          <div class="d-flex align-center ga-3 py-2">
            <v-avatar :color="item.success ? meta(item.type).color : 'error'" variant="tonal" rounded="lg" size="34">
              <v-icon :icon="meta(item.type).icon" size="18" />
            </v-avatar>
            <div class="min-w-0">
              <div class="text-body-2 font-weight-bold">
                {{ meta(item.type).label }}
                <v-chip v-if="!item.success" size="x-small" color="error" variant="flat" class="ml-1">failed</v-chip>
              </div>
              <div class="text-caption text-medium-emphasis summary">{{ item.summary }}</div>
            </div>
          </div>
        </template>
        <template #item.user="{ item }">
          <div class="text-body-2 font-weight-medium">{{ item.user || '—' }}</div>
          <div v-if="item.runAs && item.runAs !== item.user" class="text-caption text-medium-emphasis">
            as {{ item.runAs }}
          </div>
        </template>
        <template #item.sourceIp="{ item }">
          <div class="text-body-2 text-mono">{{ item.sourceIp || '—' }}</div>
          <div class="text-caption text-medium-emphasis">{{ item.host }}</div>
        </template>
        <template #no-data>
          <div class="empty">
            <v-icon icon="mdi-server-security" size="40" class="mb-2" />
            <div class="font-weight-medium">No server activity</div>
            <div class="text-caption text-medium-emphasis">Entries appear here once the agent reports.</div>
          </div>
        </template>
      </v-data-table-server>
    </v-card>

    <!-- full entry -->
    <v-dialog :model-value="!!open" max-width="680" scrollable @update:model-value="open = null">
      <v-card v-if="open" rounded="xl">
        <div class="d-flex align-center ga-3 pa-5 pb-3">
          <v-avatar :color="open.success ? meta(open.type).color : 'error'" variant="tonal" rounded="lg">
            <v-icon :icon="meta(open.type).icon" />
          </v-avatar>
          <div class="min-w-0">
            <div class="text-h6 font-weight-bold">{{ meta(open.type).label }}</div>
            <div class="text-caption text-medium-emphasis">{{ formatDateTime(open.at) }} · {{ open.host }}</div>
          </div>
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" @click="open = null" />
        </div>
        <v-card-text class="pt-0">
          <div class="facts">
            <div>
              <span>Result</span
              ><strong :class="open.success ? 'text-success' : 'text-error'">{{
                open.success ? 'Success' : 'Failed / refused'
              }}</strong>
            </div>
            <div>
              <span>Who</span><strong>{{ open.user || '—' }}</strong>
            </div>
            <div>
              <span>Ran as</span><strong>{{ open.runAs || '—' }}</strong>
            </div>
            <div>
              <span>From IP</span><strong class="text-mono">{{ open.sourceIp || '—' }}</strong>
            </div>
          </div>
          <div class="text-body-2 my-4">{{ open.summary }}</div>
          <template v-if="Array.isArray(open.detail?.paths) && (open.detail?.paths as string[]).length">
            <div class="text-overline">Files ({{ open.detail?.count ?? (open.detail?.paths as string[]).length }})</div>
            <pre class="json mb-4">{{ (open.detail?.paths as string[]).join('\n') }}</pre>
          </template>
          <div class="text-overline">Raw detail</div>
          <pre class="json">{{ pretty(open.detail) }}</pre>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" location="top" timeout="2500">{{ snack.text }}</v-snackbar>
  </div>
</template>

<style scoped>
.agents {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.agent {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-radius: 14px;
  color: #1e9e6a;
  background: rgba(30, 158, 106, 0.08);
  border: 1px solid rgba(30, 158, 106, 0.25);
}
.agent.bad {
  color: #d9443a;
  background: rgba(217, 68, 58, 0.08);
  border-color: rgba(217, 68, 58, 0.3);
}
.agent .text-caption {
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.link {
  text-decoration: underline;
  color: inherit;
}
.min-w-0 {
  min-width: 0;
}
.summary {
  max-width: 640px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.clickable :deep(tbody tr) {
  cursor: pointer;
}
.tiles {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}
@media (max-width: 860px) {
  .tiles {
    grid-template-columns: repeat(2, 1fr);
  }
}
.tile {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  border-radius: 16px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgb(var(--v-theme-surface));
}
.tile-icon {
  width: 46px;
  height: 46px;
  border-radius: 13px;
  display: grid;
  place-items: center;
}
.tile-value {
  font-size: 1.6rem;
  font-weight: 800;
  line-height: 1.1;
}
.tile-label {
  font-size: 0.8rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.tone-teal .tile-icon {
  background: rgba(13, 148, 136, 0.14);
  color: #0d9488;
}
.tone-green .tile-icon {
  background: rgba(46, 158, 91, 0.14);
  color: #2e9e5b;
}
.tone-red .tile-icon {
  background: rgba(217, 68, 58, 0.14);
  color: #d9443a;
}
.tone-amber .tile-icon {
  background: rgba(237, 161, 0, 0.16);
  color: #e09a00;
}
.facts {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
@media (max-width: 600px) {
  .facts {
    grid-template-columns: repeat(2, 1fr);
  }
}
.facts > div {
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.facts span {
  font-size: 0.72rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.json {
  margin: 0;
  padding: 12px;
  border-radius: 10px;
  font-family: Menlo, Consolas, monospace;
  font-size: 0.78rem;
  white-space: pre-wrap;
  word-break: break-word;
  background: rgba(var(--v-theme-on-surface), 0.05);
  max-height: 280px;
  overflow: auto;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 48px 16px;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
</style>
