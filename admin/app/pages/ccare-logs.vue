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
if (!(me.value?.role === 'admin' || me.value?.canManage)) await navigateTo('/ccare')

const search = ref('')
const action = ref<string | null>(null)
const page = ref(1)
const pageSize = 50

const { data: summary, refresh: refreshSummary } = await useAsyncData('ccare-log-summary', () =>
  api<Summary>('/ccare/logs/summary'),
)
const { data: actions } = await useAsyncData('ccare-log-actions', () => api<string[]>('/ccare/log-actions'))
const { data, pending, refresh } = await useAsyncData(
  'ccare-logs',
  () =>
    api<LogPage>('/ccare/logs', {
      query: { search: search.value || undefined, action: action.value || undefined, page: page.value, pageSize },
    }),
  { watch: [page] },
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
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
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
}
const label = (a: string) => LABELS[a] ?? a
const icon = (a: string) => ICONS[a] ?? 'mdi-circle-small'
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
    <div class="d-flex flex-wrap align-center ga-3 mb-5">
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
        <v-spacer />
        <span class="text-caption text-medium-emphasis">{{ total.toLocaleString() }} entries</span>
      </div>

      <v-divider />

      <v-table hover density="comfortable">
        <thead>
          <tr>
            <th style="width: 160px">Time</th>
            <th style="width: 220px">Action</th>
            <th>Account</th>
            <th>By</th>
            <th>Details</th>
            <th style="width: 120px">IP</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id">
            <td class="text-no-wrap text-caption">{{ formatDateTime(r.at) }}</td>
            <td>
              <v-chip size="small" :color="actionColor(r.action)" variant="tonal" :prepend-icon="icon(r.action)">
                {{ label(r.action) }}
              </v-chip>
            </td>
            <td class="font-weight-medium">{{ r.name || '—' }}</td>
            <td class="text-medium-emphasis">{{ r.actor || (r.detail?.self ? 'self' : '—') }}</td>
            <td class="text-caption text-medium-emphasis">{{ detailText(r.detail) }}</td>
            <td class="text-mono text-caption">{{ r.ip || '' }}</td>
          </tr>
          <tr v-if="pending && !rows.length">
            <td colspan="6" class="text-center py-12"><v-progress-circular indeterminate color="primary" /></td>
          </tr>
          <tr v-else-if="!rows.length">
            <td colspan="6">
              <div class="empty">
                <v-icon icon="mdi-clipboard-text-clock-outline" size="40" class="mb-2" />
                <div class="font-weight-medium">No activity yet</div>
                <div class="text-caption text-medium-emphasis">
                  Sign-ins, codes and account changes will appear here as staff use the CCare portal.
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </v-table>

      <div v-if="pageCount > 1" class="d-flex justify-center pa-3">
        <v-pagination v-model="page" :length="pageCount" :total-visible="6" density="comfortable" />
      </div>
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
</style>
