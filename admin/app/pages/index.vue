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
const days = ref(14)
const { data, pending, error, refresh } = await useAsyncData(
  'overview',
  () => api<Overview>('/stats/overview', { query: { days: days.value } }),
  { watch: [days] },
)

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
    <div class="d-flex flex-wrap align-center ga-3 mb-6">
      <div>
        <h1 class="text-h5 font-weight-bold">Dashboard</h1>
        <div class="text-body-2 text-medium-emphasis">Who is using the app and what they do most</div>
      </div>
      <v-spacer />
      <v-btn-toggle v-model="days" mandatory density="comfortable" variant="outlined" divided rounded="lg">
        <v-btn :value="7" class="text-none">7 days</v-btn>
        <v-btn :value="14" class="text-none">14 days</v-btn>
        <v-btn :value="30" class="text-none">30 days</v-btn>
      </v-btn-toggle>
      <v-btn icon="mdi-refresh" variant="text" :loading="pending" @click="refresh()" />
    </div>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4" :text="error.data?.message || 'Could not load the dashboard'" />

    <template v-if="data">
      <!-- headline numbers -->
      <v-row>
        <v-col cols="12" sm="6" md="4" xl>
          <StatCard title="All users" :value="data.totals.totalUsers" icon="mdi-account-group" :hint="`+${data.totals.newUsersToday} new today`" />
        </v-col>
        <v-col cols="12" sm="6" md="4" xl>
          <StatCard title="Active today" :value="data.totals.activeToday" icon="mdi-account-clock" color="success" />
        </v-col>
        <v-col cols="12" sm="6" md="4" xl>
          <StatCard title="Logins today" :value="data.totals.loginsToday" icon="mdi-login" color="info" />
        </v-col>
        <v-col cols="12" sm="6" md="6" xl>
          <StatCard title="Actions today" :value="data.totals.eventsToday" icon="mdi-gesture-tap" color="warning" />
        </v-col>
        <v-col cols="12" md="6" xl>
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
        v-if="data.totals.failedToday"
        type="error"
        variant="tonal"
        icon="mdi-alert-circle-outline"
        rounded="lg"
        class="mt-4"
      >
        <strong>{{ data.totals.failedToday }}</strong> failed action{{ data.totals.failedToday > 1 ? 's' : '' }} today.
        <template #append>
          <v-btn to="/events" variant="text" size="small" class="text-none">See activity log</v-btn>
        </template>
      </v-alert>

      <!-- daily trend -->
      <v-card class="bordered mt-4">
        <v-card-item>
          <v-card-title class="font-weight-bold">Daily trend</v-card-title>
          <v-card-subtitle>Number of {{ METRIC_LABEL[metric] }} per day · last {{ days }} days</v-card-subtitle>
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

      <!-- pies + live -->
      <v-row class="mt-1">
        <v-col cols="12" lg="4">
          <v-card class="bordered h-100">
            <v-card-item prepend-icon="mdi-chart-donut">
              <v-card-title class="font-weight-bold">What users do</v-card-title>
              <v-card-subtitle>All actions by type · {{ days }} days</v-card-subtitle>
            </v-card-item>
            <v-card-text>
              <DonutChart :slices="typeSlices" center-label="Actions" :size="180" />
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" lg="4">
          <v-card class="bordered h-100">
            <v-card-item prepend-icon="mdi-chart-pie">
              <v-card-title class="font-weight-bold">API results</v-card-title>
              <v-card-subtitle>Did the app's requests work? · {{ days }} days</v-card-subtitle>
            </v-card-item>
            <v-card-text>
              <DonutChart :slices="resultSlices" center-label="API calls" :size="180" />
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
                <div v-for="e in feed" :key="e.id" class="d-flex align-center ga-3 py-2 feed-row">
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
                </div>
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
            <div class="py-8 text-medium-emphasis">No transfers in the last {{ days }} days</div>
          </template>
        </v-data-table>
      </v-card>

      <!-- horizontal bars -->
      <v-row class="mt-1">
        <v-col cols="12" lg="6">
          <v-card class="bordered h-100">
            <v-card-item prepend-icon="mdi-api">
              <v-card-title class="font-weight-bold">Most used features (APIs)</v-card-title>
              <v-card-subtitle>Calls per feature, split by result · {{ days }} days</v-card-subtitle>
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
              <v-card-subtitle>Times opened · {{ days }} days</v-card-subtitle>
            </v-card-item>
            <v-card-text>
              <HBarChart :rows="screenRows" empty-text="No screens yet" />
            </v-card-text>
          </v-card>
          <v-card class="bordered">
            <v-card-item prepend-icon="mdi-gesture-tap">
              <v-card-title class="font-weight-bold">Most tapped buttons</v-card-title>
              <v-card-subtitle>Times tapped · {{ days }} days</v-card-subtitle>
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
.feed-enter-active {
  transition: all 0.4s ease;
}
.feed-enter-from {
  opacity: 0;
  transform: translateY(-8px);
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
