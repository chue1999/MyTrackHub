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

useHead({ title: 'CCare activity' })
const api = useApi()
const { admin: me } = useAuth()
if (!(me.value?.role === 'admin' || me.value?.canManage)) await navigateTo('/ccare-vas')

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
  login_start: 'Sign-in started',
  otp_sent: 'Code sent',
  login_ok: 'Signed in',
  login_fail: 'Wrong password',
  otp_fail: 'Wrong code',
  otp_expired: 'Code expired',
  otp_blocked: 'Number not enabled',
  forgot_request: 'Forgot password',
  password_reset: 'Password reset (self)',
  logout: 'Signed out',
  account_create: 'Account created',
  account_update: 'Account edited',
  account_close: 'Account closed',
  account_reopen: 'Account reopened',
  password_reset_by_admin: 'Password reset by admin',
  import: 'Accounts imported',
  vas: 'Vas Service',
}
const ICONS: Record<string, string> = {
  login_ok: 'mdi-login-variant',
  login_start: 'mdi-account-key-outline',
  otp_sent: 'mdi-message-badge-outline',
  login_fail: 'mdi-lock-alert-outline',
  otp_fail: 'mdi-shield-alert-outline',
  otp_expired: 'mdi-timer-sand-complete',
  otp_blocked: 'mdi-cancel',
  forgot_request: 'mdi-help-circle-outline',
  password_reset: 'mdi-lock-reset',
  password_reset_by_admin: 'mdi-lock-reset',
  account_create: 'mdi-account-plus-outline',
  account_update: 'mdi-account-edit-outline',
  account_close: 'mdi-account-cancel-outline',
  account_reopen: 'mdi-account-check-outline',
  vas: 'mdi-cellphone-cog',
}
const label = (a: string) => LABELS[a] ?? a
const icon = (a: string) => ICONS[a] ?? 'mdi-circle-small'
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
function actionColor(a: string) {
  if (a.includes('fail') || a.includes('close') || a.includes('blocked') || a.includes('expired')) return 'error'
  if (a === 'login_ok' || a === 'account_create' || a.includes('reset') || a.includes('reopen')) return 'success'
  return 'info'
}
const detailText = (d: Record<string, unknown> | null) =>
  d
    ? Object.entries(d)
        .filter(([k]) => !['self'].includes(k))
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · ')
    : ''
</script>

<template>
  <div>
    <div class="d-flex flex-wrap align-center ga-3 mb-6">
      <div>
        <h1 class="page-title">CCare activity</h1>
        <div class="text-body-2 text-medium-emphasis">Every sign-in, code and account change</div>
      </div>
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
