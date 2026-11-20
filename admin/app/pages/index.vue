<script setup lang="ts">
import type { TrackedEvent } from '~/composables/useApi'

interface Transfer {
  id: string
  occurredAt: string
  success: boolean | null
  result: string | null
  receiver: string | null
  amount: number | null
  userId: string | null
  msisdn: string | null
  firstName: string | null
  lastName: string | null
}
interface Overview {
  outdatedRecent: number
  recentFailures: TrackedEvent[]
  logouts: { full: number; toPassword: number; fullToday: number; toPasswordToday: number }
  totals: {
    totalUsers: number
    newUsersToday: number
    activeToday: number
    eventsToday: number
    loginsToday: number
    failedToday: number
  }
  daily: { date: string; activeUsers: number; events: number; logins: number }[]
  topScreens: { name: string; count: number; users: number }[]
  topTaps: { name: string; count: number; users: number }[]
  topApis: { name: string; count: number; users: number; avgMs: number | null; succeeded: number; failed: number }[]
  byType: { type: string; count: number }[]
  apiResults: { success: number; failed: number; unknown: number }
  transfersToday: { count: number; succeeded: number; failed: number; amount: number }
  recentTransfers: Transfer[]
}

const api = useApi()
// Start / end date-time for every chart and list on this page.
const range = ref(lastDays(14))
const days = computed(() => rangeText(range.value))
const { data, pending, error, refresh } = await useAsyncData(
  'overview',
  () => api<Overview>('/stats/overview', { query: { from: rangeIso(range.value.from), to: rangeIso(range.value.to, true) } }),
  { watch: [range] },
)

// ── today vs yesterday (from the daily series) ──
const { admin } = useAuth()
const deltaOf = (k: 'activeUsers' | 'logins' | 'events') => {
  const d = data.value?.daily ?? []
  if (d.length < 2) return null
  return d[d.length - 1]![k] - d[d.length - 2]![k]
}
const greeting = computed(() => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
})
// Local date as YYYY-MM-DD, for "failed today" links.
const todayIso = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()
const failedTodayLink = `/events?result=failed&from=${todayIso}&to=${todayIso}`
const todayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

// ── daily trend ──
const metric = ref<'activeUsers' | 'logins' | 'events'>('activeUsers')
const METRIC_LABEL = { activeUsers: 'active users', logins: 'logins', events: 'actions' }
const trend = computed(() =>
  (data.value?.daily ?? []).map((d) => ({
    label: d.date.slice(8),
    title: new Date(`${d.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
    value: d[metric.value],
  })),
)

// ── logouts: full vs back to password ──
const logoutParts = computed(() => {
  const l = data.value?.logouts
  if (!l) return []
  return [
    {
      key: 'full',
      label: 'Logged out completely',
      description: 'Back to entering phone number, then password',
      value: l.full,
      color: 'var(--series-1)',
      icon: 'mdi-logout',
      extra: `${l.fullToday} today`,
    },
    {
      key: 'password',
      label: 'Locked: back to password',
      description: 'Still signed in; only the password (PIN) is asked again',
      value: l.toPassword,
      color: 'var(--series-2)',
      icon: 'mdi-lock-clock',
      extra: `${l.toPasswordToday} today`,
    },
  ]
})

// ── pies ──
const typeSlices = computed(() =>
  (data.value?.byType ?? []).map((t) => ({
    key: t.type,
    label: EVENT_META[t.type]?.label ?? t.type,
    value: t.count,
    color: TYPE_COLOR[t.type] ?? 'var(--status-unknown)',
    icon: EVENT_META[t.type]?.icon,
  })),
)
const resultSlices = computed(() => {
  const r = data.value?.apiResults
  if (!r) return []
  return [
    { key: 'success', label: 'Success', value: r.success, color: 'var(--status-good)', icon: 'mdi-check-circle-outline' },
    { key: 'failed', label: 'Failed', value: r.failed, color: 'var(--status-critical)', icon: 'mdi-close-circle-outline' },
    ...(r.unknown
      ? [{ key: 'unknown', label: 'Not checked (old app)', value: r.unknown, color: 'var(--status-unknown)', icon: 'mdi-help-circle-outline' }]
      : []),
  ]
})

// ── horizontal bars ──
const apiRows = computed(() =>
  (data.value?.topApis ?? []).map((a) => ({
    id: a.name,
    label: apiLabel(a.name),
    sublabel: `${a.users} users${a.avgMs != null ? ` · avg ${a.avgMs} ms` : ''}`,
    segments: [
      { key: 's', label: 'Success', value: a.succeeded, color: 'var(--status-good)' },
      { key: 'f', label: 'Failed', value: a.failed, color: 'var(--status-critical)' },
      { key: 'u', label: 'Not checked', value: a.count - a.succeeded - a.failed, color: 'var(--status-unknown)' },
    ],
  })),
)
const single = (rows: { name: string; count: number; users: number }[], fmt: (n: string) => string) =>
  rows.map((r) => ({
    id: r.name,
    label: fmt(r.name),
    sublabel: `${r.users} users`,
    segments: [{ key: 'c', label: 'Times', value: r.count, color: 'var(--series-1)' }],
  }))
const screenRows = computed(() => single(data.value?.topScreens ?? [], screenLabel))
const tapRows = computed(() => single(data.value?.topTaps ?? [], (n) => n))

// ── transfers ──
const receiver = (t: Transfer) =>
  t.receiver ? formatPhone(t.receiver.replace(/^\+?856/, '').replace(/^0/, '')) : '—'
const transferHeaders = [
  { title: 'Time', key: 'occurredAt', sortable: false, width: 130 },
  { title: 'From', key: 'from', sortable: false },
  { title: 'To (receiver)', key: 'receiver', sortable: false },
  { title: 'Amount', key: 'amount', sortable: false, align: 'end' as const },
  { title: 'Result', key: 'success', sortable: false, align: 'center' as const, width: 110 },
  { title: 'Server answer', key: 'result', sortable: false },
]

// ── live ──
const live = useLive()
const feed = ref<TrackedEvent[]>([])
const refreshSoon = debounce(() => refresh(), 1500)
live.onEvents(({ events }) => {
  feed.value = [...[...events].reverse(), ...feed.value].slice(0, 8)
  if (data.value) {
    const t = data.value.totals
    data.value = {
      ...data.value,
      totals: {
        ...t,
        eventsToday: t.eventsToday + events.length,
        loginsToday: t.loginsToday + events.filter((e) => e.type === 'login').length,
        failedToday: t.failedToday + events.filter((e) => e.success === false).length,
      },
    }
  }
  refreshSoon()
})
</script>

<template>
  <div>
    <!-- welcome banner -->
    <section class="hero mb-6">
      <div class="hero-glow" />
      <div class="hero-content">
        <div>
          <div class="hero-date">{{ todayLabel }}</div>
          <h1 class="hero-title">{{ greeting }}, {{ admin?.displayName || admin?.username }}</h1>
          <p class="hero-sub">Here's what's happening in the MyTPlus app.</p>
          <div v-if="data" class="hero-chips">
            <span><v-icon icon="mdi-account-clock" size="16" /> {{ data.totals.activeToday }} active today</span>
            <span><v-icon icon="mdi-login" size="16" /> {{ data.totals.loginsToday }} logins</span>
            <span><v-icon icon="mdi-bank-transfer" size="16" /> {{ formatMoney(data.transfersToday.amount) }} transferred</span>
            <NuxtLink v-if="data.totals.failedToday" :to="failedTodayLink" class="bad" title="Show only today's failed actions">
              <v-icon icon="mdi-alert-circle" size="16" /> {{ data.totals.failedToday }} failed today
              <v-icon icon="mdi-arrow-right" size="14" />
            </NuxtLink>
          </div>
        </div>
        <div class="hero-actions">
          <DateRange v-model="range" />
          <v-btn icon="mdi-refresh" variant="flat" color="white" rounded="lg" :loading="pending" title="Refresh" @click="refresh()" />
        </div>
      </div>
    </section>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4" :text="error.data?.message || 'Could not load the dashboard'" />

    <template v-if="data">
      <!-- headline numbers -->
      <v-row>
        <v-col cols="12" sm="6" md="4" lg>
          <StatCard title="All users" :value="data.totals.totalUsers" icon="mdi-account-group" :hint="`+${data.totals.newUsersToday} new today`" />
        </v-col>
        <v-col cols="12" sm="6" md="4" lg>
          <StatCard title="Active today" :value="data.totals.activeToday" icon="mdi-account-clock" color="success" :delta="deltaOf('activeUsers')" />
        </v-col>
        <v-col cols="12" sm="6" md="4" lg>
          <StatCard title="Logins today" :value="data.totals.loginsToday" icon="mdi-login" color="info" :delta="deltaOf('logins')" />
        </v-col>
        <v-col cols="12" sm="6" md="6" lg>
          <StatCard title="Actions today" :value="data.totals.eventsToday" icon="mdi-gesture-tap" color="warning" :delta="deltaOf('events')" />
        </v-col>
        <v-col cols="12" md="6" lg>
          <StatCard
            title="Transferred today"
            :value="formatMoney(data.transfersToday.amount)"
            icon="mdi-bank-transfer"
            color="purple"
            :hint="`${data.transfersToday.count} transfers · ${data.transfersToday.succeeded} ok · ${data.transfersToday.failed} failed`"
          />
        </v-col>
      </v-row>

      <v-alert
        v-if="data.outdatedRecent"
        type="warning"
        variant="tonal"
        icon="mdi-cellphone-arrow-down"
        rounded="lg"
        class="mt-4"
      >
        <div class="font-weight-bold">The app is still running an old version of the tracker</div>
        <div class="text-body-2">
          {{ data.outdatedRecent }} API calls in the last 15 minutes arrived without details (receiver, amount, result).
          Fully restart the app: stop it and run it again, or press Hot Restart (Shift+Cmd+F5). Hot Reload is not enough.
        </div>
      </v-alert>


      <!-- needs attention: today's failures -->
      <v-card v-if="data.recentFailures.length" class="bordered attention mt-4">
        <div class="attention-head">
          <div class="attention-icon"><v-icon icon="mdi-alert-octagon-outline" size="26" /></div>
          <div class="flex-grow-1">
            <div class="attention-title">Needs attention</div>
            <div class="attention-sub">
              {{ data.totals.failedToday }} action{{ data.totals.failedToday > 1 ? 's' : '' }} failed today. The latest are below. Click one to see what happened.
            </div>
          </div>
          <v-btn :to="failedTodayLink" variant="flat" color="error" rounded="lg" class="text-none" append-icon="mdi-arrow-right">
            All {{ data.totals.failedToday }} failures
          </v-btn>
        </div>
        <div class="fail-list">
          <NuxtLink v-for="f in data.recentFailures" :key="f.id" :to="`/events/${f.id}`" class="fail-item">
            <div class="fail-dot"><v-icon icon="mdi-close" size="16" /></div>
            <div class="flex-grow-1" style="min-width: 0">
              <div class="d-flex align-center ga-2">
                <span class="font-weight-bold text-truncate">{{ eventTitle(f) }}</span>
                <span v-if="apiSummaryLine(f)" class="fail-summary text-truncate">{{ apiSummaryLine(f) }}</span>
              </div>
              <div class="fail-msg text-truncate">{{ f.result || 'Failed' }}</div>
            </div>
            <div class="text-right flex-shrink-0">
              <div class="text-body-2 font-weight-medium text-truncate" style="max-width: 160px">{{ f.user ? fullName(f.user) : 'Guest' }}</div>
              <div class="text-caption text-medium-emphasis text-mono">{{ formatTime(f.occurredAt) }}</div>
            </div>
            <v-icon icon="mdi-chevron-right" class="text-medium-emphasis" />
          </NuxtLink>
        </div>
      </v-card>

      <!-- daily trend -->
      <v-card class="bordered mt-4">
        <v-card-item>
          <v-card-title class="font-weight-bold">Daily trend</v-card-title>
          <v-card-subtitle>Number of {{ METRIC_LABEL[metric] }} per day · {{ days }}</v-card-subtitle>
          <template #append>
            <v-chip-group v-model="metric" mandatory selected-class="text-primary">
              <v-chip value="activeUsers" filter variant="outlined">Active users</v-chip>
              <v-chip value="logins" filter variant="outlined">Logins</v-chip>
              <v-chip value="events" filter variant="outlined">Actions</v-chip>
            </v-chip-group>
          </template>
        </v-card-item>
        <v-card-text>
          <ColumnChart :points="trend" :unit="METRIC_LABEL[metric]" />
        </v-card-text>
      </v-card>

      <!-- logouts -->
      <v-card class="bordered mt-4">
        <v-card-item prepend-icon="mdi-logout-variant">
          <v-card-title class="font-weight-bold">Logouts</v-card-title>
          <v-card-subtitle>How users left the app · {{ days }}</v-card-subtitle>
        </v-card-item>
        <v-card-text>
          <SplitBar :parts="logoutParts" empty-text="No logouts yet" :height="52" />
        </v-card-text>
      </v-card>

      <!-- pies + live -->
      <v-row class="mt-1">
        <v-col cols="12" lg="4">
          <v-card class="bordered h-100">
            <v-card-item prepend-icon="mdi-chart-donut">
              <v-card-title class="font-weight-bold">What users do</v-card-title>
              <v-card-subtitle>All actions by type · {{ days }}</v-card-subtitle>
            </v-card-item>
            <v-card-text>
              <Pie3D :slices="typeSlices" total-label="actions" :width="230" />
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" lg="4">
          <v-card class="bordered h-100">
            <v-card-item prepend-icon="mdi-chart-pie">
              <v-card-title class="font-weight-bold">API results</v-card-title>
              <v-card-subtitle>Did the app's requests work? · {{ days }}</v-card-subtitle>
            </v-card-item>
            <v-card-text>
              <Pie3D :slices="resultSlices" total-label="API calls" :width="230" />
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" lg="4">
          <v-card class="bordered h-100">
            <v-card-item prepend-icon="mdi-broadcast">
              <v-card-title class="font-weight-bold">Live activity</v-card-title>
              <v-card-subtitle>{{ live.connected.value ? 'Appears the moment it happens' : 'Reconnecting…' }}</v-card-subtitle>
            </v-card-item>
            <v-card-text>
              <transition-group name="feed" tag="div">
                <NuxtLink v-for="e in feed" :key="e.id" :to="`/events/${e.id}`" class="d-flex align-center ga-3 py-2 feed-row">
                  <v-avatar
                    :color="e.type === 'api' ? (e.success === false ? 'error' : 'success') : EVENT_META[e.type]?.color"
                    size="30"
                    variant="tonal"
                  >
                    <v-icon :icon="EVENT_META[e.type]?.icon" size="16" />
                  </v-avatar>
                  <div class="flex-grow-1 text-body-2" style="min-width: 0">
                    <div class="font-weight-bold text-truncate">{{ eventTitle(e) }}</div>
                    <div class="text-caption text-medium-emphasis text-truncate">
                      {{ e.user ? fullName(e.user) : 'Guest' }}
                      <template v-if="e.type === 'api' && apiSummaryLine(e)"> · {{ apiSummaryLine(e) }}</template>
                    </div>
                  </div>
                  <span class="text-caption text-medium-emphasis text-mono">{{ formatTime(e.occurredAt) }}</span>
                </NuxtLink>
              </transition-group>
              <div v-if="!feed.length" class="text-medium-emphasis text-center py-8">
                <v-icon icon="mdi-timer-sand" size="32" class="mb-2" />
                <div>Waiting for activity…</div>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- transfers -->
      <v-card class="bordered mt-4">
        <v-card-item prepend-icon="mdi-bank-transfer">
          <v-card-title class="font-weight-bold">Recent transfers</v-card-title>
          <v-card-subtitle>Who sent money to which number, how much, and whether it worked</v-card-subtitle>
          <template #append>
            <v-btn to="/events?search=TransferBalance" variant="text" size="small" class="text-none" append-icon="mdi-arrow-right">
              All transfers
            </v-btn>
          </template>
        </v-card-item>
        <v-data-table
          :headers="transferHeaders"
          :items="data.recentTransfers"
          :items-per-page="-1"
          hide-default-footer
          density="comfortable"
          class="transfer-table"
          hover
          @click:row="(_: unknown, { item }: { item: Transfer }) => navigateTo(`/events/${item.id}`)"
        >
          <template #item.occurredAt="{ item }">
            <div class="font-weight-bold text-mono">{{ formatTime(item.occurredAt) }}</div>
            <div class="text-caption text-medium-emphasis">
              {{ new Date(item.occurredAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) }}
            </div>
          </template>
          <template #item.from="{ item }">
            <NuxtLink v-if="item.userId" :to="`/users/${item.userId}`" class="text-decoration-none" style="color: inherit">
              <div class="font-weight-medium">{{ fullName(item) }}</div>
              <div class="text-caption text-medium-emphasis text-mono">{{ formatPhone(item.msisdn) }}</div>
            </NuxtLink>
            <span v-else class="text-medium-emphasis">Unknown</span>
          </template>
          <template #item.receiver="{ item }">
            <div class="d-flex align-center ga-2">
              <v-icon icon="mdi-arrow-right-bold" size="16" class="text-medium-emphasis" />
              <span class="text-body-1 font-weight-bold text-mono">{{ receiver(item) }}</span>
            </div>
          </template>
          <template #item.amount="{ item }">
            <span class="text-body-1 font-weight-black" style="font-variant-numeric: tabular-nums">
              {{ item.amount != null ? formatMoney(item.amount) : '—' }}
            </span>
          </template>
          <template #item.success="{ item }">
            <v-chip
              v-if="item.success !== null"
              size="small"
              :color="item.success ? 'success' : 'error'"
              variant="flat"
              :prepend-icon="item.success ? 'mdi-check' : 'mdi-close'"
            >
              {{ item.success ? 'Success' : 'Failed' }}
            </v-chip>
            <span v-else class="text-medium-emphasis">—</span>
          </template>
          <template #item.result="{ item }">
            <span :class="item.success === false ? 'text-error' : 'text-medium-emphasis'" class="text-body-2">
              {{ item.result || '—' }}
            </span>
          </template>
          <template #no-data>
            <div class="py-8 text-medium-emphasis">No transfers in this period ({{ days }})</div>
          </template>
        </v-data-table>
      </v-card>

      <!-- horizontal bars -->
      <v-row class="mt-1">
        <v-col cols="12" lg="6">
          <v-card class="bordered h-100">
            <v-card-item prepend-icon="mdi-api">
              <v-card-title class="font-weight-bold">Most used features (APIs)</v-card-title>
              <v-card-subtitle>Calls per feature, split by result · {{ days }}</v-card-subtitle>
            </v-card-item>
            <v-card-text>
              <HBarChart
                :rows="apiRows"
                :legend="[
                  { label: 'Success', color: 'var(--status-good)' },
                  { label: 'Failed', color: 'var(--status-critical)' },
                  { label: 'Not checked', color: 'var(--status-unknown)' },
                ]"
                empty-text="No API calls yet"
              />
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" lg="6">
          <v-card class="bordered mb-4">
            <v-card-item prepend-icon="mdi-cellphone-screenshot">
              <v-card-title class="font-weight-bold">Most opened screens</v-card-title>
              <v-card-subtitle>Times opened · {{ days }}</v-card-subtitle>
            </v-card-item>
            <v-card-text>
              <HBarChart :rows="screenRows" empty-text="No screens yet" />
            </v-card-text>
          </v-card>
          <v-card class="bordered">
            <v-card-item prepend-icon="mdi-gesture-tap">
              <v-card-title class="font-weight-bold">Most tapped buttons</v-card-title>
              <v-card-subtitle>Times tapped · {{ days }}</v-card-subtitle>
            </v-card-item>
            <v-card-text>
              <HBarChart :rows="tapRows" empty-text="No taps yet" />
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>

    <div v-else-if="pending" class="d-flex justify-center py-16">
      <v-progress-circular indeterminate color="primary" />
    </div>
  </div>
</template>

<style scoped>
.hero {
  position: relative;
  overflow: hidden;
  border-radius: 22px;
  padding: 28px 30px;
  color: #1a1a1a;
  background: linear-gradient(120deg, #fcd021 0%, #ffbf1f 55%, #ffa600 100%);
  box-shadow: 0 12px 32px rgba(255, 179, 0, 0.22);
}
.hero-glow {
  position: absolute;
  right: -120px;
  top: -160px;
  width: 460px;
  height: 460px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.55), transparent 65%);
  pointer-events: none;
}
.hero-content {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
}
.hero-date {
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.7;
}
.hero-title {
  font-size: 1.9rem;
  font-weight: 900;
  letter-spacing: -0.03em;
  line-height: 1.15;
  margin: 4px 0 4px;
}
.hero-sub {
  opacity: 0.8;
  margin: 0 0 14px;
}
.hero-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.hero-chips > span,
.hero-chips > a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(4px);
}
.hero-chips > .bad {
  background: #1a1a1a;
  color: #ffd54a;
  text-decoration: none;
}
.hero-chips > .bad:hover {
  background: #000;
}
.hero-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.range {
  display: flex;
  gap: 8px;
}
.range-btn {
  padding: 9px 16px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 0.9rem;
  color: #1a1a1a;
  background: rgba(255, 255, 255, 0.75);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  transition: background 0.15s, color 0.15s, transform 0.1s;
  cursor: pointer;
}
.range-btn:hover {
  background: #fff;
}
.range-btn:active {
  transform: scale(0.97);
}
.range-btn.on {
  background: #1a1a1a;
  color: #fff;
}
.range-btn:focus-visible {
  outline: 2px solid #1a1a1a;
  outline-offset: 2px;
}
.hero-actions {
  gap: 12px !important;
}
.feed-enter-active {
  transition: all 0.4s ease;
}
.feed-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}
.feed-row {
  color: inherit;
  text-decoration: none;
  border-radius: 10px;
}
.feed-row:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.attention {
  overflow: hidden;
}
.attention-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  padding: 18px 20px;
  background: linear-gradient(120deg, rgba(217, 68, 58, 0.12), rgba(217, 68, 58, 0.04));
  border-bottom: 1px solid rgba(217, 68, 58, 0.15);
}
.attention-icon {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: #fff;
  background: linear-gradient(135deg, #e2574c, #c93b32);
  box-shadow: 0 6px 16px rgba(201, 59, 50, 0.3);
}
.attention-title {
  font-weight: 800;
  font-size: 1.05rem;
}
.attention-sub {
  font-size: 0.85rem;
  color: rgba(var(--v-theme-on-surface), 0.65);
}
.fail-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
}
.fail-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  color: inherit;
  text-decoration: none;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  transition: background 0.15s;
}
.fail-item:hover {
  background: rgba(217, 68, 58, 0.05);
}
.fail-dot {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: #fff;
  background: #d9443a;
}
.fail-summary {
  font-size: 0.78rem;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.fail-msg {
  font-size: 0.85rem;
  color: #c0392b;
}
.v-theme--dark .fail-msg {
  color: #ff8a80;
}
.feed-row + .feed-row {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.transfer-table :deep(thead th) {
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 0.72rem !important;
  letter-spacing: 0.04em;
}
</style>
