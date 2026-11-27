<script setup lang="ts">
interface LogRow {
  id: number
  ccareUserId: number | null
  name: string | null
  action: string
  success: boolean
  actor: string | null
  detail: Record<string, unknown> | null
  ip: string | null
  at: string
}
interface LogPage {
  rows: LogRow[]
  total: number
  page: number
  pageSize: number
}
interface Summary {
  total: number
  signInsToday: number
  failedToday: number
  changesToday: number
}

const api = useApi()

const search = ref('')
const action = ref<string | null>(null)
const page = ref(1)
const pageSize = ref(50)

const { data: summary, refresh: refreshSummary } = await useAsyncData('ccare-log-summary', () =>
  api<Summary>('/ccare/logs/summary'),
)
const { data: actions } = await useAsyncData('ccare-log-actions', () => api<string[]>('/ccare/log-actions'))
const { data, pending, refresh } = await useAsyncData(
  'ccare-logs',
  () =>
    api<LogPage>('/ccare/logs', {
      query: {
        search: search.value || undefined,
        action: action.value || undefined,
        page: page.value,
        pageSize: pageSize.value,
      },
    }),
  { watch: [page, pageSize] },
)
function reload() {
  refresh()
  refreshSummary()
}
let t: ReturnType<typeof setTimeout>
watch([search, action], () => {
  clearTimeout(t)
  t = setTimeout(() => {
    page.value = 1
    refresh()
  }, 300)
})

const rows = computed(() => data.value?.rows ?? [])
const total = computed(() => data.value?.total ?? 0)
const headers = [
  { title: 'Time', key: 'at', sortable: false, width: 160 },
  { title: 'What happened', key: 'action', sortable: false },
  { title: 'Details', key: 'details', sortable: false },
  { title: 'By', key: 'by', sortable: false, width: 120 },
]

/** Click a name to see only that user's history (newest first). */
function filterUser(name: string) {
  search.value = name
  action.value = null
  page.value = 1
}

/** Click a row to open the full entry on its own page. */
function openRow(_e: unknown, { item }: { item: LogRow }) {
  navigateTo(`/ccare-log/${item.id}`)
}

const snack = reactive({ show: false, text: '', color: 'success' })
const toast = (text: string, color = 'success') => Object.assign(snack, { show: true, text, color })

// ── Export to Excel: every entry matching the current filters (all if none) ──
const EXPORT_PAGE = 5000
const EXPORT_MAX = 50_000
const exporting = ref(false)
const exportProgress = ref(0)

async function exportXlsx() {
  exporting.value = true
  exportProgress.value = 0
  try {
    const query = { search: search.value || undefined, action: action.value || undefined }
    const all: LogRow[] = []
    let grand = 0
    for (let p = 1; ; p++) {
      const r = await api<LogPage>('/ccare/logs', { query: { ...query, page: p, pageSize: EXPORT_PAGE } })
      grand = r.total
      all.push(...r.rows)
      exportProgress.value = grand ? Math.round((all.length / Math.min(grand, EXPORT_MAX)) * 100) : 100
      if (!r.rows.length || all.length >= grand || all.length >= EXPORT_MAX) break
    }
    const rows = all.slice(0, EXPORT_MAX).map((r) => ({
      at: new Date(r.at),
      action: label(r.action),
      code: r.action,
      result: r.success ? 'Success' : 'Failed',
      name: r.name ?? '',
      actor: r.actor ?? '',
      details: detailText(r.detail),
      ip: r.ip ?? '',
    }))
    const count = (pred: (r: LogRow) => boolean) => all.filter(pred).length
    const filters = [
      action.value ? `Action: ${label(action.value)}` : '',
      search.value ? `Search: ${search.value}` : '',
    ]
      .filter(Boolean)
      .join(' · ')
    const first = all.at(-1)?.at
    const last = all[0]?.at
    await exportExcel({
      title: 'CCare activity log',
      periodText: first && last ? `${formatDateTime(first)} – ${formatDateTime(last)}` : 'all time',
      filtersText: filters,
      columns: [
        { key: 'at', header: 'Time', type: 'date', width: 20 },
        { key: 'action', header: 'What happened', width: 26 },
        { key: 'code', header: 'Action code', width: 22 },
        { key: 'result', header: 'Result', type: 'result', width: 10 },
        { key: 'name', header: 'User', width: 18 },
        { key: 'actor', header: 'By', width: 16 },
        { key: 'details', header: 'Details', width: 60 },
        { key: 'ip', header: 'IP', width: 16 },
      ],
      rows,
      summary: [
        { label: 'Entries', value: rows.length },
        { label: 'Successful', value: count((r) => r.success) },
        { label: 'Failed', value: count((r) => !r.success) },
        { label: 'Sign-ins', value: count((r) => r.action === 'login_ok') },
        { label: 'Vas Service requests', value: count((r) => r.action === 'vas') },
        { label: 'E-SIM registered', value: count((r) => r.action === 'tplus_esim_register') },
        { label: 'Nice numbers confirmed', value: count((r) => r.action === 'tplus_nice_confirm') },
        { label: 'Numbers approved', value: count((r) => r.action === 'tplus_pool_approve') },
      ],
      fileName: `ccare-activity-${new Date().toISOString().slice(0, 10)}.xlsx`,
      truncatedFrom: grand > EXPORT_MAX ? grand : null,
    })
    toast(`Exported ${rows.length.toLocaleString()} entries`)
  } catch (e) {
    toast(errorMessage(e, 'Could not export'), 'error')
  } finally {
    exporting.value = false
  }
}

const tiles = computed(() => [
  { label: 'Total entries', value: summary.value?.total ?? 0, icon: 'mdi-clipboard-text-clock-outline', tone: 'teal' },
  { label: 'Sign-ins today', value: summary.value?.signInsToday ?? 0, icon: 'mdi-login-variant', tone: 'green' },
  { label: 'Failed today', value: summary.value?.failedToday ?? 0, icon: 'mdi-alert-circle-outline', tone: 'red' },
  {
    label: 'Account changes today',
    value: summary.value?.changesToday ?? 0,
    icon: 'mdi-account-edit-outline',
    tone: 'amber',
  },
])

const LABELS: Record<string, string> = {
  password_expired: 'Password expired (sign-in refused)',
  password_sent: 'Password sent by SMS',
  login_start: 'Sign-in started',
  otp_sent: 'Code sent',
  login_ok: 'Signed in',
  login_fail: 'Wrong password',
  otp_fail: 'Wrong code',
  otp_expired: 'Code expired',
  otp_blocked: 'Number not enabled',
  forgot_request: 'Forgot password',
  forgot_code_ok: 'Reset code correct',
  password_reset: 'Password reset (self)',
  logout: 'Signed out',
  account_create: 'Account created',
  account_update: 'Account edited',
  account_close: 'Account closed',
  account_reopen: 'Account reopened',
  password_reset_by_admin: 'Password reset by admin',
  import: 'Accounts imported',
  vas: 'Vas Service',
  tplus_esim_register: 'E-SIM registered',
  tplus_nice_confirm: 'Nice number confirmed',
  tplus_pool_approve: 'Number approved',
  log_deleted: 'Log entry deleted',
  logs_cleared: 'Logs cleared',
  admin_account_delete: 'Admin account deleted',
  events_purged: 'Old app events deleted',
  sql_delete: 'SQL delete run',
}
const ICONS: Record<string, string> = {
  password_expired: 'mdi-lock-clock',
  password_sent: 'mdi-message-lock-outline',
  login_ok: 'mdi-login-variant',
  login_start: 'mdi-account-key-outline',
  otp_sent: 'mdi-message-badge-outline',
  login_fail: 'mdi-lock-alert-outline',
  otp_fail: 'mdi-shield-alert-outline',
  otp_expired: 'mdi-timer-sand-complete',
  otp_blocked: 'mdi-cancel',
  forgot_request: 'mdi-help-circle-outline',
  forgot_code_ok: 'mdi-check-decagram-outline',
  password_reset: 'mdi-lock-reset',
  password_reset_by_admin: 'mdi-lock-reset',
  account_create: 'mdi-account-plus-outline',
  account_update: 'mdi-account-edit-outline',
  account_close: 'mdi-account-cancel-outline',
  account_reopen: 'mdi-account-check-outline',
  vas: 'mdi-cellphone-cog',
  tplus_esim_register: 'mdi-sim-outline',
  tplus_nice_confirm: 'mdi-star-check-outline',
  tplus_pool_approve: 'mdi-check-decagram-outline',
  log_deleted: 'mdi-trash-can-outline',
  logs_cleared: 'mdi-broom',
  admin_account_delete: 'mdi-account-remove-outline',
  events_purged: 'mdi-delete-clock-outline',
  sql_delete: 'mdi-database-remove-outline',
}
const label = (a: string) => LABELS[a] ?? a
const icon = (a: string) => ICONS[a] ?? 'mdi-circle-small'
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
function actionColor(a: string) {
  if (['fail', 'close', 'blocked', 'expired', 'delete', 'clear', 'purge'].some((w) => a.includes(w))) return 'error'
  if (a === 'login_ok' || a === 'account_create' || a.includes('reset') || a.includes('reopen')) return 'success'
  return 'info'
}
const detailText = (d: Record<string, unknown> | null) =>
  d
    ? Object.entries(d)
        .filter(([k]) => !['self'].includes(k))
        .map(([k, v]) => `${k}: ${v && typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join(' · ')
    : ''
</script>

<template>
  <div>
    <div class="d-flex align-center ga-3 mb-3">
      <div class="text-body-2 text-medium-emphasis">Every sign-in, code, account change and service request</div>
      <v-spacer />
      <v-btn icon="mdi-refresh" variant="text" :loading="pending" @click="reload" />
    </div>

    <!-- summary tiles -->
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
      <div class="d-flex flex-wrap align-center ga-2 pa-3">
        <v-icon icon="mdi-filter-variant" size="18" class="text-medium-emphasis" />
        <v-select
          v-model="action"
          :items="[
            { title: 'All actions', value: null },
            ...(actions ?? []).map((a) => ({ title: label(a), value: a })),
          ]"
          density="compact"
          variant="outlined"
          hide-details
          style="max-width: 220px"
        />
        <v-text-field
          v-model="search"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          prepend-inner-icon="mdi-magnify"
          placeholder="Search name or admin…"
          style="max-width: 280px"
        />
        <v-chip
          v-if="search"
          size="small"
          color="primary"
          variant="tonal"
          closable
          prepend-icon="mdi-account-search-outline"
          @click:close="search = ''"
        >
          {{ search }}
        </v-chip>
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
          {{ action || search ? 'Export filtered' : 'Export all' }}
          <template #loader>
            <v-progress-circular indeterminate size="16" width="2" class="mr-2" />{{ exportProgress }}%
          </template>
        </v-btn>
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
        class="cc-log-table"
        @click:row="openRow"
      >
        <template #item.at="{ item }">
          <div class="py-2">
            <div class="text-body-2 font-weight-bold text-mono">{{ formatTime(item.at) }}</div>
            <div class="text-caption text-medium-emphasis">{{ shortDate(item.at) }}</div>
          </div>
        </template>
        <template #item.action="{ item }">
          <div class="d-flex align-center ga-3 py-2">
            <v-avatar :color="actionColor(item.action)" variant="tonal" rounded="lg" size="34">
              <v-icon :icon="icon(item.action)" size="18" />
            </v-avatar>
            <div style="min-width: 0">
              <div class="text-body-2 font-weight-bold">{{ label(item.action) }}</div>
              <div class="text-caption">
                <NuxtLink
                  v-if="item.ccareUserId"
                  :to="`/ccare-user/${item.ccareUserId}`"
                  class="name-link"
                  title="Open this user"
                  @click.stop
                >
                  {{ item.name }}
                </NuxtLink>
                <button
                  v-else-if="item.name"
                  class="name-link"
                  title="See only this user"
                  @click.stop="filterUser(item.name)"
                >
                  {{ item.name }}
                </button>
                <span v-else class="text-medium-emphasis">—</span>
              </div>
            </div>
          </div>
        </template>
        <template #item.details="{ item }">
          <div class="text-caption text-medium-emphasis" style="max-width: 360px">{{ detailText(item.detail) }}</div>
          <div v-if="item.ip" class="text-caption text-medium-emphasis text-mono">{{ item.ip }}</div>
        </template>
        <template #item.by="{ item }">
          <span class="text-caption text-medium-emphasis">{{ item.actor || (item.detail?.self ? 'self' : '—') }}</span>
        </template>
        <template #no-data>
          <div class="empty">
            <v-icon icon="mdi-clipboard-text-clock-outline" size="40" class="mb-2" />
            <div class="font-weight-medium">No activity yet</div>
            <div class="text-caption text-medium-emphasis">
              Sign-ins, codes and account changes will appear here as staff use the CCare portal.
            </div>
          </div>
        </template>
      </v-data-table-server>
    </v-card>

    <v-snackbar v-model="snack.show" :color="snack.color" location="top" timeout="2500">{{ snack.text }}</v-snackbar>
  </div>
</template>

<style scoped>
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
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 48px 16px;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.detail-json {
  margin: 0;
  padding: 12px;
  border-radius: 10px;
  font-family: Menlo, Consolas, monospace;
  font-size: 0.8rem;
  white-space: pre-wrap;
  word-break: break-word;
  background: rgba(var(--v-theme-on-surface), 0.05);
  max-height: 240px;
  overflow: auto;
}
.name-link {
  font-weight: 600;
  color: #d97706;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
}
.name-link:hover {
  text-decoration: underline;
}
</style>
