<script setup lang="ts">
/** One CCare activity entry, in full, on its own page (opened from the lists). */
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

const api = useApi()
const route = useRoute()
const { admin: me } = useAuth()
const canManage = computed(() => me.value?.role === 'admin' || me.value?.canManage === true)
if (!canManage.value) await navigateTo('/ccare-vas')
const id = computed(() => String(route.params.id))

const LABELS: Record<string, string> = {
  password_sent: 'Password sent by SMS',
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
  password_sent: 'mdi-message-lock-outline',
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
  tplus_esim_register: 'mdi-sim-outline',
  tplus_nice_confirm: 'mdi-star-check-outline',
  tplus_pool_approve: 'mdi-check-decagram-outline',
  log_deleted: 'mdi-trash-can-outline',
  logs_cleared: 'mdi-broom',
  admin_account_delete: 'mdi-account-remove-outline',
  events_purged: 'mdi-delete-clock-outline',
  sql_delete: 'mdi-database-remove-outline',
}
function label(a: string) {
  return LABELS[a] ?? a
}
const icon = (a: string) => ICONS[a] ?? 'mdi-circle-small'
function actionColor(a: string) {
  if (['fail', 'close', 'blocked', 'expired', 'delete', 'clear', 'purge'].some((w) => a.includes(w))) return 'error'
  if (a === 'login_ok' || a === 'account_create' || a.includes('reset') || a.includes('reopen')) return 'success'
  return 'info'
}

const { data: log, error } = await useAsyncData(`ccare-log-${id.value}`, () => api<LogRow>(`/ccare/logs/${id.value}`))
useHead({ title: () => (log.value ? `${label(log.value.action)} · CCare activity` : 'CCare activity') })

/** The detail object as readable key/value rows (self is implied by "By"). */
const detailRows = computed(() =>
  Object.entries(log.value?.detail ?? {})
    .filter(([k]) => k !== 'self')
    .map(([k, v]) => ({ key: k, value: typeof v === 'object' ? JSON.stringify(v) : String(v) })),
)
const prettyDetail = (d: Record<string, unknown> | null) => (d ? JSON.stringify(d, null, 2) : '—')

const router = useRouter()
function back() {
  if (window.history.length > 1) router.back()
  else navigateTo('/logs?tab=ccare')
}
</script>

<template>
  <div class="log-page">
    <v-btn variant="text" prepend-icon="mdi-arrow-left" class="mb-4 text-none" @click="back">Back to activity</v-btn>

    <v-alert
      v-if="error"
      type="error"
      variant="tonal"
      :text="errorMessage(error, 'Could not load this activity entry')"
    />

    <template v-if="log">
      <!-- hero -->
      <v-card class="bordered hero mb-4">
        <div class="hero-row">
          <v-avatar :color="actionColor(log.action)" variant="flat" rounded="xl" size="64" class="hero-avatar">
            <v-icon :icon="icon(log.action)" size="30" />
          </v-avatar>
          <div class="hero-text">
            <div class="text-h5 font-weight-bold">{{ label(log.action) }}</div>
            <div class="text-body-2 text-medium-emphasis">{{ formatDateTime(log.at) }} · {{ timeAgo(log.at) }}</div>
          </div>
          <v-spacer />
          <v-chip
            :color="log.success ? 'success' : 'error'"
            variant="tonal"
            size="large"
            :prepend-icon="log.success ? 'mdi-check-circle' : 'mdi-alert-circle'"
          >
            {{ log.success ? 'Success' : 'Failed' }}
          </v-chip>
        </div>
      </v-card>

      <v-row>
        <!-- facts -->
        <v-col cols="12" md="5">
          <v-card class="bordered">
            <div class="card-head">
              <v-icon icon="mdi-information-outline" size="18" class="text-medium-emphasis" />
              <span>Entry</span>
            </div>
            <v-divider />
            <v-list density="comfortable" class="py-1">
              <v-list-item prepend-icon="mdi-account-outline" title="Account">
                <template #subtitle>
                  <NuxtLink v-if="log.ccareUserId" :to="`/ccare-user/${log.ccareUserId}`" class="name-link">
                    {{ log.name || '—' }}
                  </NuxtLink>
                  <span v-else>{{ log.name || '—' }}</span>
                </template>
              </v-list-item>
              <v-list-item
                prepend-icon="mdi-shield-account-outline"
                title="Performed by"
                :subtitle="log.actor || (log.detail?.self ? 'self (the account holder)' : '—')"
              />
              <v-list-item prepend-icon="mdi-ip-network-outline" title="IP address" :subtitle="log.ip || '—'" />
              <v-list-item prepend-icon="mdi-clock-outline" title="When" :subtitle="formatDateTime(log.at)" />
              <v-list-item prepend-icon="mdi-identifier" title="Entry ID" :subtitle="`#${log.id}`" />
            </v-list>
          </v-card>
        </v-col>

        <!-- details -->
        <v-col cols="12" md="7">
          <v-card class="bordered">
            <div class="card-head">
              <v-icon icon="mdi-code-json" size="18" class="text-medium-emphasis" />
              <span>Details</span>
            </div>
            <v-divider />
            <div v-if="detailRows.length" class="kv">
              <div v-for="row in detailRows" :key="row.key" class="kv-row">
                <div class="kv-key">{{ row.key }}</div>
                <div class="kv-val">{{ row.value }}</div>
              </div>
            </div>
            <div v-else class="pa-6 text-center text-medium-emphasis">No extra details were recorded.</div>
            <template v-if="detailRows.length">
              <v-divider />
              <div class="pa-4">
                <div class="text-caption text-medium-emphasis mb-1">Raw</div>
                <pre class="detail-json">{{ prettyDetail(log.detail) }}</pre>
              </div>
            </template>
          </v-card>
        </v-col>
      </v-row>

      <div v-if="log.ccareUserId" class="mt-4">
        <v-btn
          :to="`/ccare-user/${log.ccareUserId}`"
          color="primary"
          variant="flat"
          class="text-none text-black"
          prepend-icon="mdi-account-arrow-right-outline"
        >
          View all of {{ log.name }}'s activity
        </v-btn>
      </div>
    </template>
  </div>
</template>

<style scoped>
.log-page {
  max-width: 1040px;
}
.hero {
  overflow: hidden;
  position: relative;
}
.hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(252, 208, 33, 0.14), transparent 55%);
  pointer-events: none;
}
.hero-row {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 22px 24px;
  position: relative;
}
.hero-avatar {
  flex: 0 0 auto;
}
.hero-text {
  min-width: 0;
}
.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  font-weight: 700;
  font-size: 0.95rem;
}
.kv {
  display: flex;
  flex-direction: column;
}
.kv-row {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: 14px;
  padding: 12px 18px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}
.kv-row:last-child {
  border-bottom: 0;
}
.kv-key {
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.6);
  text-transform: capitalize;
}
.kv-val {
  font-weight: 500;
  word-break: break-word;
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
  max-height: 260px;
  overflow: auto;
}
.name-link {
  font-weight: 600;
  color: #d97706;
  text-decoration: none;
}
.name-link:hover {
  text-decoration: underline;
}
</style>
