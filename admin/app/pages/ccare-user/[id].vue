<script setup lang="ts">
import type { CcareUser } from '~/types/api'

/** One CCare staff member: profile + their full activity (MyTPlus-style). */
interface LogRow {
  id: number
  name: string | null
  action: string
  success: boolean
  actor: string | null
  detail: Record<string, unknown> | null
  ip: string | null
  at: string
}
interface Detail {
  user: CcareUser
  summary: { actions: number; logins: number; failed: number; lastAt: string | null }
}
interface LogPage {
  rows: LogRow[]
  total: number
  page: number
  pageSize: number
}

const api = useApi()
const route = useRoute()
const { admin: me } = useAuth()
const canManage = computed(() => me.value?.role === 'admin' || me.value?.canManage === true)
if (!canManage.value) await navigateTo('/ccare-vas')
const id = computed(() => String(route.params.id))

const { data: detail, error } = await useAsyncData(`ccare-user-${id.value}`, () =>
  api<Detail>(`/ccare/users/${id.value}/detail`),
)
useHead({ title: () => `${detail.value?.user.nameLa || detail.value?.user.name || 'CCare user'} · CCare` })

const action = ref<string | null>(null)
const search = ref('')
const searchDebounced = ref('')
let t: ReturnType<typeof setTimeout> | undefined
watch(search, (v) => {
  clearTimeout(t)
  t = setTimeout(() => {
    searchDebounced.value = (v || '').trim()
    page.value = 1
  }, 300)
})
const page = ref(1)
const pageSize = 50
const { data: logs, pending } = await useAsyncData(
  `ccare-user-logs-${id.value}`,
  () =>
    api<LogPage>('/ccare/logs', {
      query: {
        userId: id.value,
        action: action.value || undefined,
        search: searchDebounced.value || undefined,
        page: page.value,
        pageSize,
      },
    }),
  { watch: [action, searchDebounced, page] },
)
watch(action, () => (page.value = 1))
const rows = computed(() => logs.value?.rows ?? [])
const total = computed(() => logs.value?.total ?? 0)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

const { data: actions } = await useAsyncData('ccare-log-actions', () => api<string[]>('/ccare/log-actions'))

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
  login_ok: 'mdi-login-variant',
  login_start: 'mdi-account-key-outline',
  otp_sent: 'mdi-message-badge-outline',
  login_fail: 'mdi-lock-alert-outline',
  otp_fail: 'mdi-shield-alert-outline',
  otp_expired: 'mdi-timer-sand-complete',
  forgot_request: 'mdi-help-circle-outline',
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
function actionColor(a: string) {
  if (['fail', 'close', 'blocked', 'expired', 'delete', 'clear', 'purge'].some((w) => a.includes(w))) return 'error'
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
const initial = (u?: CcareUser) => (u?.nameLa || u?.name || '?')[0]?.toUpperCase()

const tiles = computed(() => {
  const s = detail.value?.summary
  return [
    { label: 'Actions', value: s?.actions ?? 0, icon: 'mdi-lightning-bolt' },
    { label: 'Sign-ins', value: s?.logins ?? 0, icon: 'mdi-login' },
    { label: 'Failed', value: s?.failed ?? 0, icon: 'mdi-alert-circle-outline' },
  ]
})
</script>

<template>
  <div>
    <v-btn to="/logs?tab=ccare" variant="text" prepend-icon="mdi-arrow-left" class="mb-4 text-none">CCare logs</v-btn>
    <v-alert v-if="error" type="error" variant="tonal" :text="errorMessage(error, 'Could not load this user')" />

    <v-row v-if="detail">
      <!-- profile -->
      <v-col cols="12" lg="4">
        <v-card class="bordered">
          <v-card-text class="text-center pt-8">
            <v-avatar :color="detail.user.canManage ? 'primary' : 'grey'" size="80" class="mb-3">
              <span class="text-h5 font-weight-bold" :class="detail.user.canManage ? 'text-black' : ''">
                {{ initial(detail.user) }}
              </span>
            </v-avatar>
            <div class="text-h6 font-weight-bold">{{ detail.user.nameLa || detail.user.name }}</div>
            <div class="text-body-2 text-mono text-medium-emphasis">{{ detail.user.name }}</div>
            <div class="d-flex justify-center ga-2 mt-3">
              <v-chip size="small" :color="detail.user.canManage ? 'primary' : undefined" variant="tonal">
                {{ detail.user.canManage ? 'CCare admin' : 'Staff' }}
              </v-chip>
              <v-chip size="small" :color="detail.user.active ? 'success' : 'error'" variant="tonal">
                {{ detail.user.active ? 'Active' : 'Closed' }}
              </v-chip>
            </div>
          </v-card-text>
          <v-divider />
          <v-list density="compact" class="py-2">
            <v-list-item
              prepend-icon="mdi-card-account-details-outline"
              title="Staff ID"
              :subtitle="detail.user.staffId || '—'"
            />
            <v-list-item prepend-icon="mdi-phone-outline" title="Phone" :subtitle="detail.user.staffTel || '—'" />
            <v-list-item
              prepend-icon="mdi-office-building-outline"
              title="Division"
              :subtitle="detail.user.division || '—'"
            />
            <v-list-item
              prepend-icon="mdi-badge-account-outline"
              title="Position"
              :subtitle="detail.user.position || '—'"
            />
            <v-list-item prepend-icon="mdi-tag-outline" title="Brand" :subtitle="detail.user.brandId || '—'" />
            <v-list-item
              prepend-icon="mdi-clock-outline"
              title="Last activity"
              :subtitle="
                detail.summary.lastAt
                  ? `${timeAgo(detail.summary.lastAt)} · ${formatDateTime(detail.summary.lastAt)}`
                  : 'Never'
              "
            />
            <v-list-item
              prepend-icon="mdi-calendar-plus"
              title="Created"
              :subtitle="detail.user.cdate ? formatDateTime(detail.user.cdate) : '—'"
            />
          </v-list>
        </v-card>

        <v-row class="mt-1" dense>
          <v-col v-for="s in tiles" :key="s.label" cols="4">
            <v-card class="bordered">
              <v-card-text class="pa-3">
                <v-icon :icon="s.icon" size="18" color="primary" />
                <div class="text-h6 font-weight-bold">{{ s.value.toLocaleString() }}</div>
                <div class="text-caption text-medium-emphasis">{{ s.label }}</div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-col>

      <!-- activity -->
      <v-col cols="12" lg="8">
        <v-card class="bordered">
          <div class="d-flex flex-wrap align-center ga-3 pa-4">
            <v-icon icon="mdi-timeline-text-outline" size="22" class="text-medium-emphasis" />
            <div>
              <div class="text-subtitle-1 font-weight-bold">Activity</div>
              <div class="text-caption text-medium-emphasis">{{ total.toLocaleString() }} entries · newest first</div>
            </div>
            <v-spacer />
            <v-select
              v-model="action"
              :items="[
                { title: 'All actions', value: null },
                ...(actions ?? []).map((a) => ({ title: label(a), value: a })),
              ]"
              density="compact"
              variant="outlined"
              hide-details
              style="max-width: 200px"
            />
            <v-text-field
              v-model="search"
              density="compact"
              variant="outlined"
              hide-details
              clearable
              prepend-inner-icon="mdi-magnify"
              placeholder="Search this user's actions…"
              style="max-width: 240px"
            />
          </div>
          <v-divider />
          <v-table hover density="comfortable">
            <thead>
              <tr>
                <th style="width: 160px">Time</th>
                <th style="width: 210px">Action</th>
                <th>Details</th>
                <th style="width: 120px">By</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.id" class="log-row" @click="navigateTo(`/ccare-log/${r.id}`)">
                <td class="text-no-wrap text-caption">{{ formatDateTime(r.at) }}</td>
                <td>
                  <v-chip size="small" :color="actionColor(r.action)" variant="tonal" :prepend-icon="icon(r.action)">
                    {{ label(r.action) }}
                  </v-chip>
                </td>
                <td class="text-caption text-medium-emphasis">{{ detailText(r.detail) }}</td>
                <td class="text-medium-emphasis text-caption">{{ r.actor || (r.detail?.self ? 'self' : '—') }}</td>
              </tr>
              <tr v-if="pending && !rows.length">
                <td colspan="4" class="text-center py-10"><v-progress-circular indeterminate color="primary" /></td>
              </tr>
              <tr v-else-if="!rows.length">
                <td colspan="4" class="text-center py-10 text-medium-emphasis">No activity for this user yet.</td>
              </tr>
            </tbody>
          </v-table>
          <div v-if="pageCount > 1" class="d-flex justify-center pa-3">
            <v-pagination v-model="page" :length="pageCount" :total-visible="6" density="comfortable" />
          </div>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<style scoped>
.log-row {
  cursor: pointer;
}
</style>
