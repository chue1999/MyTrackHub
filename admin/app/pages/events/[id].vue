<script setup lang="ts">
import type { TrackedEvent, JsonRecord } from '~/types/api'

const api = useApi()
const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id))

const {
  data: e,
  pending,
  error,
} = await useAsyncData(`event-${id.value}`, () => api<TrackedEvent>(`/events/${id.value}`), {
  watch: [id],
})

/** Back to wherever the user came from (activity log, user page, dashboard). */
function goBack() {
  if (window.history.state?.back) router.back()
  else navigateTo('/logs?tab=mytplus')
}

const p = computed(() => (e.value?.properties ?? {}) as JsonRecord)
const isApi = computed(() => e.value?.type === 'api')
const summary = computed(() => (e.value && isApi.value ? apiSummary(e.value) : []))
const status = computed(() => {
  if (!e.value || e.value.success == null) return null
  return e.value.success
    ? { tone: 'ok', icon: 'mdi-check-circle', text: 'Success' }
    : { tone: 'bad', icon: 'mdi-close-circle', text: 'Failed' }
})
const delaySec = computed(() => {
  if (!e.value?.createdAt) return null
  return Math.round((new Date(e.value.createdAt).getTime() - new Date(e.value.occurredAt).getTime()) / 1000)
})
const otherProps = computed(() => Object.entries(p.value).filter(([k]) => !['request', 'response'].includes(k)))
const pretty = (v: unknown) => JSON.stringify(v, null, 2)

interface TechItem {
  label: string
  value: string
  icon: string
  mono?: boolean
  wide?: boolean
  small?: boolean
}
const techItems = computed<TechItem[]>(() => {
  const ev = e.value
  if (!ev) return []
  const items: TechItem[] = []
  const add = (label: string, value: unknown, icon: string, opts: Partial<TechItem> = {}) => {
    if (value !== undefined && value !== null && value !== '')
      items.push({ label, value: String(value), icon, ...opts })
  }
  if (isApi.value) add('API', ev.name, 'mdi-api', { mono: true, wide: true })
  add('Server', p.value.host, 'mdi-server-network', { mono: true })
  add('HTTP status', p.value.status, 'mdi-web')
  add('Result code', p.value.resultCode, 'mdi-numeric')
  add('Time taken', p.value.ms != null ? `${p.value.ms} ms` : null, 'mdi-timer-outline')
  add('Error', p.value.error, 'mdi-alert-outline')
  add('Screen', ev.screen, 'mdi-cellphone', { mono: true, wide: true })
  if (!isApi.value && ev.type !== 'login') add('Name', ev.name, 'mdi-tag-outline', { mono: true })
  if (!isApi.value) {
    for (const [k, v] of otherProps.value) {
      add(
        k === 'reason' ? 'Reason' : k,
        k === 'reason' ? logoutReason(v) || v : typeof v === 'object' ? JSON.stringify(v) : v,
        'mdi-information-variant',
      )
    }
  }
  add('Device', [ev.deviceModel, ev.platform].filter(Boolean).join(' · '), 'mdi-cellphone-information')
  add('App version', ev.appVersion && `v${ev.appVersion}`, 'mdi-application-outline')
  add('Date & time', `${formatDateLong(ev.occurredAt)}, ${formatTime(ev.occurredAt)}`, 'mdi-calendar-clock', {
    wide: true,
  })
  if (ev.createdAt) add('Received by server', formatTime(ev.createdAt), 'mdi-cloud-check-outline', { mono: true })
  add('Session', ev.sessionId, 'mdi-identifier', { mono: true, wide: true, small: true })
  add('Action id', ev.id, 'mdi-pound', { mono: true })
  return items
})

// What was sent, without the extra { body: … } wrapper when that's all there is.
const sentValue = computed(() => {
  const r = p.value.request as Record<string, unknown> | undefined
  if (r && Object.keys(r).length === 1 && 'body' in r) return r.body
  return r
})

// Sent / Received: readable tables by default, raw JSON on request.
const view = ref<{ sent: 'table' | 'json'; received: 'table' | 'json' }>({ sent: 'table', received: 'table' })
const copied = ref('')
async function copy(label: string, v: unknown) {
  try {
    await navigator.clipboard.writeText(pretty(v))
    copied.value = label
    setTimeout(() => (copied.value = ''), 1500)
  } catch {
    // Clipboard blocked by the browser: nothing to do.
  }
}

const hasPayload = computed(() => !!(p.value.request || p.value.response))
const oldFormat = computed(() => isApi.value && !hasPayload.value && e.value?.success == null)
const tone = computed(() => status.value?.tone ?? (oldFormat.value ? 'old' : 'neutral'))
const headIcon = computed(() => status.value?.icon ?? (e.value ? EVENT_META[e.value.type]?.icon : 'mdi-help'))

useHead(() => ({ title: e.value ? eventTitle(e.value) : 'Action' }))
</script>

<template>
  <div class="detail">
    <!-- back + breadcrumb -->
    <div class="d-flex align-center flex-wrap ga-3 mb-5">
      <v-btn
        variant="flat"
        color="surface"
        rounded="lg"
        prepend-icon="mdi-arrow-left"
        class="text-none back-btn"
        @click="goBack"
      >
        Back
      </v-btn>
      <div class="crumbs">
        <NuxtLink to="/logs?tab=mytplus" class="crumb">Logs</NuxtLink>
        <v-icon icon="mdi-chevron-right" size="16" />
        <span>Action #{{ id }}</span>
      </div>
    </div>

    <v-alert
      v-if="error"
      type="error"
      variant="tonal"
      rounded="lg"
      :text="errorMessage(error, 'Could not load this action')"
    >
      <template #append>
        <v-btn variant="text" class="text-none" @click="goBack">Go back</v-btn>
      </template>
    </v-alert>

    <div v-else-if="pending && !e" class="d-flex justify-center py-16">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <template v-else-if="e">
      <!-- header -->
      <section class="head" :class="tone">
        <div class="head-glow" />
        <div class="head-icon"><v-icon :icon="headIcon" size="32" /></div>
        <div class="flex-grow-1" style="min-width: 0">
          <div class="head-type">{{ EVENT_META[e.type]?.label }}</div>
          <h1 class="head-title">{{ eventTitle(e) }}</h1>
          <div class="head-meta">
            <span v-if="isApi && apiSummaryLine(e)" class="pill strong">{{ apiSummaryLine(e) }}</span>
            <span class="pill"
              ><v-icon icon="mdi-clock-outline" size="15" /> {{ formatTime(e.occurredAt) }} ·
              {{ timeAgo(e.occurredAt) }}</span
            >
            <span v-if="p.ms != null" class="pill"><v-icon icon="mdi-timer-outline" size="15" /> {{ p.ms }} ms</span>
          </div>
        </div>
        <div class="head-status">
          <v-icon
            :icon="status?.icon ?? (oldFormat ? 'mdi-help-circle-outline' : 'mdi-information-outline')"
            size="20"
          />
          {{ status?.text ?? (oldFormat ? 'Result not recorded' : EVENT_META[e.type]?.label) }}
        </div>
      </section>

      <!-- old app note (small) -->
      <div v-if="oldFormat" class="old-note">
        <v-icon icon="mdi-cellphone-arrow-down" size="18" />
        <span
          >Recorded by an older version of the app, so there is no receiver, amount or result. Fully restart the app and
          repeat the action to see everything.</span
        >
      </div>

      <!-- three key cards -->
      <div class="key-grid">
        <v-card class="bordered key">
          <div class="key-label"><v-icon icon="mdi-calendar-clock" size="18" /> When</div>
          <div class="key-big text-mono">{{ formatTime(e.occurredAt) }}</div>
          <div class="key-sub">{{ formatDateLong(e.occurredAt) }}</div>
          <div v-if="delaySec != null && delaySec > 5" class="key-note">
            Reached the server {{ delaySec }} s later (phone was probably offline)
          </div>
        </v-card>

        <v-card class="bordered key">
          <div class="key-label"><v-icon icon="mdi-account-outline" size="18" /> Who</div>
          <div class="d-flex align-center ga-3 mt-1">
            <v-avatar color="primary" size="48">
              <span class="font-weight-black text-black">{{ initials(e.user) }}</span>
            </v-avatar>
            <div class="flex-grow-1" style="min-width: 0">
              <div class="key-name text-truncate">{{ e.user ? fullName(e.user) : 'Not logged in' }}</div>
              <div class="key-sub text-mono phone">{{ formatPhone(e.user?.msisdn ?? e.msisdn) }}</div>
            </div>
          </div>
          <v-btn
            v-if="e.user"
            :to="`/users/${e.user.id}`"
            variant="tonal"
            size="small"
            rounded="lg"
            class="text-none mt-3"
            append-icon="mdi-arrow-right"
          >
            Open user
          </v-btn>
        </v-card>

        <v-card class="bordered key" :class="`result-${tone}`">
          <div class="key-label"><v-icon icon="mdi-flag-outline" size="18" /> Result</div>
          <div class="key-big result-text">
            <v-icon :icon="status?.icon ?? 'mdi-minus-circle-outline'" size="28" />
            {{ status?.text ?? (isApi ? 'Not recorded' : 'Done') }}
          </div>
          <div class="key-sub">
            {{
              e.result ||
              (p.status
                ? `HTTP ${p.status}${p.resultCode != null ? ` · code ${p.resultCode}` : ''}`
                : e.type === 'logout'
                  ? logoutReason(p.reason)
                  : '—')
            }}
          </div>
        </v-card>
      </div>

      <!-- summary -->
      <v-card v-if="summary.length" class="bordered mt-4">
        <v-card-item prepend-icon="mdi-swap-horizontal">
          <v-card-title class="font-weight-bold">Summary</v-card-title>
        </v-card-item>
        <div class="facts">
          <div v-for="row in summary" :key="row.label" class="fact">
            <v-icon :icon="row.icon" size="24" class="text-medium-emphasis" />
            <div>
              <div class="fact-label">{{ row.label }}</div>
              <div :class="row.strong ? 'fact-big' : 'fact-value'">{{ row.value }}</div>
            </div>
          </div>
        </div>
      </v-card>

      <!-- sent / received side by side -->
      <v-row v-if="hasPayload" class="mt-1">
        <v-col v-if="p.request" cols="12">
          <v-card class="bordered h-100">
            <v-card-item prepend-icon="mdi-upload-outline">
              <v-card-title class="font-weight-bold">Sent</v-card-title>
              <v-card-subtitle>What the user asked for</v-card-subtitle>
              <template #append>
                <div class="view-toggle">
                  <button type="button" :class="{ on: view.sent === 'table' }" @click="view.sent = 'table'">
                    <v-icon icon="mdi-table" size="16" /> Table
                  </button>
                  <button type="button" :class="{ on: view.sent === 'json' }" @click="view.sent = 'json'">
                    <v-icon icon="mdi-code-json" size="16" /> JSON
                  </button>
                </div>
                <v-btn
                  size="small"
                  variant="text"
                  class="text-none"
                  :prepend-icon="copied === 'sent' ? 'mdi-check' : 'mdi-content-copy'"
                  @click="copy('sent', p.request)"
                >
                  {{ copied === 'sent' ? 'Copied' : 'Copy' }}
                </v-btn>
              </template>
            </v-card-item>
            <v-card-text>
              <DataView v-if="view.sent === 'table'" :value="sentValue" />
              <pre v-else class="json">{{ pretty(p.request) }}</pre>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col v-if="p.response" cols="12">
          <v-card class="bordered h-100">
            <v-card-item prepend-icon="mdi-download-outline">
              <v-card-title class="font-weight-bold">Received</v-card-title>
              <v-card-subtitle>What they got back</v-card-subtitle>
              <template #append>
                <div class="view-toggle">
                  <button type="button" :class="{ on: view.received === 'table' }" @click="view.received = 'table'">
                    <v-icon icon="mdi-table" size="16" /> Table
                  </button>
                  <button type="button" :class="{ on: view.received === 'json' }" @click="view.received = 'json'">
                    <v-icon icon="mdi-code-json" size="16" /> JSON
                  </button>
                </div>
                <v-btn
                  size="small"
                  variant="text"
                  class="text-none"
                  :prepend-icon="copied === 'received' ? 'mdi-check' : 'mdi-content-copy'"
                  @click="copy('received', p.response)"
                >
                  {{ copied === 'received' ? 'Copied' : 'Copy' }}
                </v-btn>
              </template>
            </v-card-item>
            <v-card-text>
              <DataView v-if="view.received === 'table'" :value="p.response" />
              <pre v-else class="json">{{ pretty(p.response) }}</pre>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- technical details: full width, large -->
      <v-card class="bordered mt-4">
        <v-card-item prepend-icon="mdi-information-outline">
          <v-card-title class="font-weight-bold">Technical details</v-card-title>
        </v-card-item>
        <div class="tech-grid">
          <div v-for="t in techItems" :key="t.label" class="tech-item" :class="{ wide: t.wide }">
            <div class="tech-label"><v-icon :icon="t.icon" size="18" />{{ t.label }}</div>
            <div class="tech-value" :class="{ mono: t.mono, small: t.small }">{{ t.value }}</div>
          </div>
        </div>
      </v-card>
    </template>
  </div>
</template>

<style scoped>
.view-toggle {
  display: inline-flex;
  gap: 4px;
  padding: 3px;
  margin-right: 6px;
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.view-toggle button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.65);
  cursor: pointer;
}
.view-toggle button.on {
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}
.back-btn {
  box-shadow:
    0 1px 2px rgba(17, 24, 39, 0.06),
    inset 0 0 0 1px rgba(17, 24, 39, 0.08);
}
.crumbs {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.9rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.crumb {
  color: inherit;
  text-decoration: none;
}
.crumb:hover {
  text-decoration: underline;
}

/* header */
.head {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 18px;
  padding: 24px 26px;
  border-radius: 22px;
  color: #fff;
}
.head.ok {
  background: linear-gradient(120deg, #178a49, #2bbd6a);
}
.head.bad {
  background: linear-gradient(120deg, #b8322a, #e65a4f);
}
.head.neutral {
  background: linear-gradient(120deg, #2a2a30, #44444e);
}
.head.old {
  background: linear-gradient(120deg, #4b5563, #6b7280);
}
.head-glow {
  position: absolute;
  right: -100px;
  top: -140px;
  width: 380px;
  height: 380px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.22), transparent 65%);
  pointer-events: none;
}
.head-icon {
  position: relative;
  width: 62px;
  height: 62px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.18);
  flex-shrink: 0;
}
.head-type {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  opacity: 0.8;
}
.head-title {
  font-size: 1.8rem;
  font-weight: 900;
  letter-spacing: -0.02em;
  line-height: 1.2;
  word-break: break-word;
}
.head-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.16);
}
.pill.strong {
  font-weight: 800;
  background: rgba(255, 255, 255, 0.26);
}
.head-status {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 16px;
  border-radius: 999px;
  font-weight: 800;
  background: #fff;
  color: #1a1a1a;
}
.head.ok .head-status {
  color: #1d8a4a;
}
.head.bad .head-status {
  color: #c0392b;
}
.head.old .head-status {
  color: #4b5563;
}

.old-note {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 0.88rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
  background: rgba(var(--v-theme-on-surface), 0.05);
}

/* three key cards */
.key-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
  margin-top: 16px;
}
.key {
  padding: 18px 20px;
}
.key-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(var(--v-theme-on-surface), 0.55);
  margin-bottom: 8px;
}
.key-big {
  font-size: 2rem;
  font-weight: 900;
  letter-spacing: -0.02em;
  line-height: 1.15;
}
.key-name {
  font-size: 1.15rem;
  font-weight: 800;
}
.key-sub {
  font-size: 0.95rem;
  color: rgba(var(--v-theme-on-surface), 0.65);
  margin-top: 2px;
}
.key-note {
  margin-top: 8px;
  font-size: 0.8rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.result-text {
  display: flex;
  align-items: center;
  gap: 8px;
}
.result-ok .result-text {
  color: #1d8a4a;
}
.result-bad .result-text {
  color: #c0392b;
}
.result-old .result-text,
.result-neutral .result-text {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 1.5rem;
}

/* summary */
.facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 12px;
  padding: 0 16px 16px;
}
.fact {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  border-radius: 14px;
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.fact > div {
  min-width: 0;
}
.fact-label {
  font-size: 0.82rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.fact-big {
  font-size: 1.5rem;
  font-weight: 900;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fact-value {
  font-size: 1.05rem;
  font-weight: 600;
}

/* technical */
.tech-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  padding: 0 16px 18px;
}
.tech-item {
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  min-width: 0;
}
.tech-item.wide {
  grid-column: span 2;
}
@media (max-width: 600px) {
  .tech-item.wide {
    grid-column: auto;
  }
}
.tech-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin-bottom: 4px;
}
.tech-value {
  font-size: 1.15rem;
  font-weight: 700;
  word-break: break-word;
}
.tech-value.mono {
  font-family: var(--app-font);
}
.tech-value.small {
  font-size: 0.95rem;
}

.json {
  font-family: var(--app-font);
  font-size: 12.5px;
  line-height: 1.5;
  max-height: 460px;
  overflow: auto;
  padding: 14px 16px;
  margin: 0;
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.05);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
