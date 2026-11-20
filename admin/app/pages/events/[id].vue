<script setup lang="ts">
import type { TrackedEvent } from '~/composables/useApi'

const api = useApi()
const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id))

const { data: e, pending, error } = await useAsyncData(`event-${id.value}`, () => api<TrackedEvent>(`/events/${id.value}`), {
  watch: [id],
})

/** Back to wherever the user came from (activity log, user page, dashboard). */
function goBack() {
  if (window.history.state?.back) router.back()
  else navigateTo('/events')
}

const p = computed(() => (e.value?.properties ?? {}) as Record<string, any>)
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

interface TechItem { label: string; value: string; icon: string; mono?: boolean; wide?: boolean; small?: boolean }
const techItems = computed<TechItem[]>(() => {
  const ev = e.value
  if (!ev) return []
  const items: TechItem[] = []
  const add = (label: string, value: unknown, icon: string, opts: Partial<TechItem> = {}) => {
    if (value !== undefined && value !== null && value !== '') items.push({ label, value: String(value), icon, ...opts })
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
      add(k === 'reason' ? 'Reason' : k, k === 'reason' ? logoutReason(v) || v : typeof v === 'object' ? JSON.stringify(v) : v, 'mdi-information-variant')
    }
  }
  add('Device', [ev.deviceModel, ev.platform].filter(Boolean).join(' · '), 'mdi-cellphone-information')
  add('App version', ev.appVersion && `v${ev.appVersion}`, 'mdi-application-outline')
  add('Date & time', `${formatDateLong(ev.occurredAt)}, ${formatTime(ev.occurredAt)}`, 'mdi-calendar-clock', { wide: true })
  if (ev.createdAt) add('Received by server', formatTime(ev.createdAt), 'mdi-cloud-check-outline', { mono: true })
  add('Session', ev.sessionId, 'mdi-identifier', { mono: true, wide: true, small: true })
  add('Action id', ev.id, 'mdi-pound', { mono: true })
  return items
})

const copied = ref('')
async function copy(label: string, v: unknown) {
  try {
    await navigator.clipboard.writeText(pretty(v))
    copied.value = label
    setTimeout(() => (copied.value = ''), 1500)
  } catch {}
}

useHead(() => ({ title: e.value ? `${eventTitle(e.value)} · MyTPlus Activity` : 'Action · MyTPlus Activity' }))
</script>

<template>
  <div>
    <!-- back -->
    <div class="d-flex align-center ga-3 mb-5">
      <v-btn variant="tonal" rounded="lg" prepend-icon="mdi-arrow-left" class="text-none" @click="goBack">Back</v-btn>
      <div class="text-body-2 text-medium-emphasis">
        <NuxtLink to="/events" class="crumb">Activity log</NuxtLink>
        <v-icon icon="mdi-chevron-right" size="16" />
        <span>Action #{{ id }}</span>
      </div>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" rounded="lg" :text="error.data?.message || 'Could not load this action'">
      <template #append>
        <v-btn variant="text" class="text-none" @click="goBack">Go back</v-btn>
      </template>
    </v-alert>

    <div v-else-if="pending && !e" class="d-flex justify-center py-16">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <template v-else-if="e">
      <!-- header -->
      <section class="head" :class="status?.tone ?? 'neutral'">
        <div class="head-icon">
          <v-icon :icon="status?.icon ?? EVENT_META[e.type]?.icon" size="34" />
        </div>
        <div class="flex-grow-1" style="min-width: 0">
          <div class="head-type">{{ EVENT_META[e.type]?.label }}</div>
          <h1 class="head-title">{{ eventTitle(e) }}</h1>
          <div v-if="isApi && apiSummaryLine(e)" class="head-summary">{{ apiSummaryLine(e) }}</div>
        </div>
        <div v-if="status" class="head-status">
          <v-icon :icon="status.icon" size="20" />
          {{ status.text }}
        </div>
      </section>

      <v-row class="mt-1">
        <!-- main column -->
        <v-col cols="12" lg="8">
          <!-- server answer -->
          <v-card v-if="e.result" class="bordered mb-4">
            <div class="answer" :class="e.success === false ? 'bad' : 'ok'">
              <v-icon :icon="e.success === false ? 'mdi-message-alert-outline' : 'mdi-message-check-outline'" size="26" />
              <div>
                <div class="text-caption font-weight-bold text-uppercase" style="letter-spacing: 0.05em; opacity: 0.75">Server answer</div>
                <div class="text-h6 font-weight-bold">{{ e.result }}</div>
              </div>
            </div>
          </v-card>

          <!-- business summary -->
          <v-card v-if="summary.length" class="bordered mb-4">
            <v-card-item prepend-icon="mdi-swap-horizontal">
              <v-card-title class="font-weight-bold">Summary</v-card-title>
            </v-card-item>
            <div class="facts">
              <div v-for="row in summary" :key="row.label" class="fact">
                <v-icon :icon="row.icon" size="22" class="text-medium-emphasis" />
                <div>
                  <div class="text-caption text-medium-emphasis">{{ row.label }}</div>
                  <div :class="row.strong ? 'text-h5 font-weight-black' : 'text-body-1 font-weight-medium'">{{ row.value }}</div>
                </div>
              </div>
            </div>
          </v-card>

          <!-- sent / received -->
          <v-card v-if="p.request" class="bordered mb-4">
            <v-card-item prepend-icon="mdi-upload-outline">
              <v-card-title class="font-weight-bold">Sent: what the user asked for</v-card-title>
              <template #append>
                <v-btn size="small" variant="text" class="text-none" :prepend-icon="copied === 'sent' ? 'mdi-check' : 'mdi-content-copy'" @click="copy('sent', p.request)">
                  {{ copied === 'sent' ? 'Copied' : 'Copy' }}
                </v-btn>
              </template>
            </v-card-item>
            <v-card-text><pre class="json">{{ pretty(p.request) }}</pre></v-card-text>
          </v-card>
          <v-card v-if="p.response" class="bordered mb-4">
            <v-card-item prepend-icon="mdi-download-outline">
              <v-card-title class="font-weight-bold">Received: what they got</v-card-title>
              <template #append>
                <v-btn size="small" variant="text" class="text-none" :prepend-icon="copied === 'received' ? 'mdi-check' : 'mdi-content-copy'" @click="copy('received', p.response)">
                  {{ copied === 'received' ? 'Copied' : 'Copy' }}
                </v-btn>
              </template>
            </v-card-item>
            <v-card-text><pre class="json">{{ pretty(p.response) }}</pre></v-card-text>
          </v-card>

          <v-alert v-if="isApi && !p.request && !p.response" type="info" variant="tonal" rounded="lg" icon="mdi-cellphone-arrow-down">
            This call was recorded by an older version of the app, so it has no receiver, amount or result.
            Fully restart the app and repeat the action to see all details.
          </v-alert>
        </v-col>

        <!-- side column -->
        <v-col cols="12" lg="4">
          <!-- when -->
          <v-card class="bordered mb-4">
            <div class="when">
              <v-icon icon="mdi-clock-outline" size="26" class="text-medium-emphasis" />
              <div class="flex-grow-1">
                <div class="text-caption text-medium-emphasis">Time</div>
                <div class="text-h4 font-weight-black text-mono">{{ formatTime(e.occurredAt) }}</div>
                <div class="text-body-2">{{ formatDateLong(e.occurredAt) }}</div>
              </div>
            </div>
            <v-divider />
            <div class="pa-4 d-flex align-center ga-2 text-body-2">
              <v-chip size="small" variant="tonal" prepend-icon="mdi-history">{{ timeAgo(e.occurredAt) }}</v-chip>
              <span v-if="delaySec != null && delaySec > 5" class="text-medium-emphasis">
                reached the server {{ delaySec }} s later (phone was probably offline)
              </span>
            </div>
          </v-card>

          <!-- who -->
          <v-card class="bordered mb-4">
            <v-card-item prepend-icon="mdi-account-outline">
              <v-card-title class="font-weight-bold">User</v-card-title>
            </v-card-item>
            <div class="px-4 pb-4 d-flex align-center ga-3">
              <v-avatar color="primary" size="46">
                <span class="font-weight-black text-black">{{ initials(e.user) }}</span>
              </v-avatar>
              <div class="flex-grow-1" style="min-width: 0">
                <div class="font-weight-bold text-truncate">{{ e.user ? fullName(e.user) : 'Not logged in' }}</div>
                <div class="text-mono text-body-2 text-medium-emphasis">{{ formatPhone(e.user?.msisdn ?? e.msisdn) }}</div>
              </div>
              <v-btn v-if="e.user" :to="`/users/${e.user.id}`" variant="tonal" size="small" class="text-none" append-icon="mdi-arrow-right">
                Open
              </v-btn>
            </div>
          </v-card>

        </v-col>
      </v-row>

      <!-- technical details: full width, large -->
      <v-card class="bordered mt-2">
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
.crumb {
  color: inherit;
  text-decoration: none;
}
.crumb:hover {
  text-decoration: underline;
}
.head {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 22px 24px;
  border-radius: 20px;
  color: #fff;
}
.head.ok {
  background: linear-gradient(120deg, #1f9d55, #27b866);
}
.head.bad {
  background: linear-gradient(120deg, #c93b32, #e2574c);
}
.head.neutral {
  background: linear-gradient(120deg, #2b2b30, #3a3a42);
}
.head-icon {
  width: 60px;
  height: 60px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.18);
  flex-shrink: 0;
}
.head-type {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.8;
}
.head-title {
  font-size: 1.7rem;
  font-weight: 900;
  letter-spacing: -0.02em;
  line-height: 1.2;
}
.head-summary {
  display: inline-block;
  margin-top: 6px;
  padding: 4px 10px;
  border-radius: 8px;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.18);
}
.head-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
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
.answer {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
}
.answer.bad {
  color: #c0392b;
  background: rgba(217, 68, 58, 0.08);
}
.answer.ok {
  color: #1d8a4a;
  background: rgba(46, 158, 91, 0.08);
}
.facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 12px;
  padding: 0 16px 16px;
}
.fact > div {
  min-width: 0;
}
.fact .text-h5 {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fact {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.when {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 18px;
}
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
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.tech-value.small {
  font-size: 0.95rem;
}
.json {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  line-height: 1.5;
  max-height: 420px;
  overflow: auto;
  padding: 14px 16px;
  margin: 0;
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.05);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
