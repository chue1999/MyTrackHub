<script setup lang="ts">
interface Purchase {
  id: string
  occurredAt: string
  success: boolean | null
  result: string | null
  channel: string
  code: string | null
  name: string | null
  net: string | null
  duration: string | null
  price: number | null
  forWhom: string | null
  forNumber: string | null
  userId: string | null
  msisdn: string | null
  firstName: string | null
  lastName: string | null
}
interface PackageStats {
  days: number
  totals: { sold: number; failed: number; unknown: number; revenue: number; soldNoPrice: number; buyers: number }
  today: { sold: number; revenue: number }
  byChannel: { channel: string; sold: number; revenue: number }[]
  topPackages: { code: string; name: string | null; net: string | null; duration: string | null; price: number | null; sold: number; failed: number; revenue: number }[]
  daily: { date: string; sold: number; revenue: number }[]
  recent: Purchase[]
  data: { usersWithPackages: number; activePackages: number; remainMb: number; usedMb: number }
  inUse: { name: string | null; users: number; remainMb: number; usedMb: number }[]
  lowData: { id: string; msisdn: string; firstName: string | null; lastName: string | null; remainMb: number | null; usedMb: number | null; updatedAt: string; packages: number }[]
}

const api = useApi()
const range = ref(lastDays(30))
const periodText = computed(() => rangeText(range.value))
const { data, pending, error, refresh } = await useAsyncData(
  'package-stats',
  () => api<PackageStats>('/stats/packages', { query: { from: rangeIso(range.value.from), to: rangeIso(range.value.to, true) } }),
  { watch: [range] },
)
const refreshSoon = debounce(() => refresh(), 1500)
useLive().onEvents(({ events }) => {
  if (events.some((e) => e.name.includes('RegisterPackage') || e.name === 'active_packages')) refreshSoon()
})

const metric = ref<'revenue' | 'sold'>('revenue')
const trend = computed(() =>
  (data.value?.daily ?? []).map((d) => ({
    label: d.date.slice(8),
    title: new Date(`${d.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
    value: metric.value === 'revenue' ? Math.round(d.revenue) : d.sold,
  })),
)

const channelSlices = computed(() =>
  (data.value?.byChannel ?? []).map((c) => ({
    key: c.channel,
    label: CHANNEL_META[c.channel]?.label ?? c.channel,
    value: c.sold,
    color: CHANNEL_META[c.channel]?.color ?? 'var(--status-unknown)',
    icon: CHANNEL_META[c.channel]?.icon,
  })),
)
const revenueByChannel = computed(() =>
  (data.value?.byChannel ?? []).map((c) => ({
    key: c.channel,
    label: CHANNEL_META[c.channel]?.label ?? c.channel,
    value: Math.round(c.revenue),
    color: CHANNEL_META[c.channel]?.color ?? 'var(--status-unknown)',
    icon: CHANNEL_META[c.channel]?.icon,
  })),
)

const packageRows = computed(() =>
  (data.value?.topPackages ?? []).map((p) => ({
    id: p.code,
    label: p.name || `Package ${p.code}`,
    sublabel: [p.net, p.duration, p.price != null ? formatMoney(p.price) : null, `${p.sold} sold`].filter(Boolean).join(' · '),
    segments: [{ key: 'r', label: 'Revenue (₭)', value: Math.round(p.revenue), color: 'var(--series-1)' }],
  })),
)
const inUseRows = computed(() =>
  (data.value?.inUse ?? []).map((p) => ({
    id: p.name ?? '?',
    label: p.name || 'Unknown package',
    sublabel: `${formatMb(p.remainMb)} left in total`,
    segments: [{ key: 'u', label: 'Users', value: p.users, color: 'var(--series-3)' }],
  })),
)

const avgPrice = computed(() => {
  const t = data.value?.totals
  if (!t || !t.sold) return 0
  return Math.round(t.revenue / Math.max(1, t.sold - t.soldNoPrice))
})

const purchaseHeaders = [
  { title: 'Time', key: 'occurredAt', sortable: false, width: 120 },
  { title: 'Buyer', key: 'buyer', sortable: false },
  { title: 'Package', key: 'package', sortable: false },
  { title: 'Paid with', key: 'channel', sortable: false },
  { title: 'Price', key: 'price', sortable: false, align: 'end' as const },
  { title: 'Result', key: 'success', sortable: false, align: 'center' as const, width: 110 },
]
</script>

<template>
  <div>
    <div class="d-flex flex-wrap align-center ga-3 mb-6">
      <div>
        <h1 class="page-title">Packages</h1>
        <div class="text-body-2 text-medium-emphasis">Packages bought in the app, revenue, and data left on users' packages</div>
      </div>
      <v-spacer />
      <DateRange v-model="range" />
      <v-btn icon="mdi-refresh" variant="text" :loading="pending" @click="refresh()" />
    </div>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4" :text="error.data?.message || 'Could not load package data'" />

    <template v-if="data">
      <!-- headline numbers -->
      <v-row>
        <v-col cols="12" sm="6" lg>
          <StatCard title="Packages sold" :value="data.totals.sold" icon="mdi-package-variant-closed" :hint="`${data.today.sold} today · ${periodText}`" />
        </v-col>
        <v-col cols="12" sm="6" lg>
          <StatCard title="Revenue" :value="formatMoney(data.totals.revenue)" icon="mdi-cash-multiple" color="success" :hint="`${formatMoney(data.today.revenue)} today`" />
        </v-col>
        <v-col cols="12" sm="6" lg>
          <StatCard title="Average price" :value="formatMoney(avgPrice)" icon="mdi-tag-outline" color="info" :hint="`${data.totals.buyers} different buyers`" />
        </v-col>
        <v-col cols="12" sm="6" lg>
          <StatCard title="Failed purchases" :value="data.totals.failed" icon="mdi-cart-remove" color="error" hint="e.g. not enough balance" />
        </v-col>
        <v-col cols="12" sm="6" lg>
          <StatCard title="Data left (all users)" :value="formatMb(data.data.remainMb)" icon="mdi-database-outline" color="purple" :hint="`${data.data.activePackages} active packages · ${data.data.usersWithPackages} users`" />
        </v-col>
      </v-row>

      <v-alert v-if="data.totals.soldNoPrice" type="info" variant="tonal" rounded="lg" class="mt-4" icon="mdi-information-outline">
        {{ data.totals.soldNoPrice }} purchase{{ data.totals.soldNoPrice > 1 ? 's were' : ' was' }} made before prices were recorded,
        so they count as sold but not in revenue.
      </v-alert>

      <!-- trend -->
      <v-card class="bordered mt-4">
        <v-card-item prepend-icon="mdi-chart-bar">
          <v-card-title class="font-weight-bold">{{ metric === 'revenue' ? 'Revenue per day' : 'Packages sold per day' }}</v-card-title>
          <v-card-subtitle>{{ periodText }}</v-card-subtitle>
          <template #append>
            <v-chip-group v-model="metric" mandatory selected-class="text-primary">
              <v-chip value="revenue" filter variant="outlined">Revenue (₭)</v-chip>
              <v-chip value="sold" filter variant="outlined">Packages sold</v-chip>
            </v-chip-group>
          </template>
        </v-card-item>
        <v-card-text>
          <ColumnChart :points="trend" :unit="metric === 'revenue' ? '₭' : 'packages'" :color="metric === 'revenue' ? 'var(--status-good)' : 'var(--series-1)'" />
        </v-card-text>
      </v-card>

      <!-- channels -->
      <v-row class="mt-1">
        <v-col cols="12" lg="6">
          <v-card class="bordered h-100">
            <v-card-item prepend-icon="mdi-chart-pie">
              <v-card-title class="font-weight-bold">How packages were bought</v-card-title>
              <v-card-subtitle>Number sold by payment channel</v-card-subtitle>
            </v-card-item>
            <v-card-text><Pie3D :slices="channelSlices" total-label="sold" :width="230" /></v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" lg="6">
          <v-card class="bordered h-100">
            <v-card-item prepend-icon="mdi-cash-multiple">
              <v-card-title class="font-weight-bold">Revenue by channel</v-card-title>
              <v-card-subtitle>Kip earned through each payment channel</v-card-subtitle>
            </v-card-item>
            <v-card-text>
              <Pie3D :slices="revenueByChannel" total-label="revenue" :width="230" :format-value="(n: number) => formatMoney(n)" />
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- top packages + data in use -->
      <v-row class="mt-1">
        <v-col cols="12" lg="6">
          <v-card class="bordered h-100">
            <v-card-item prepend-icon="mdi-trophy-outline">
              <v-card-title class="font-weight-bold">Best-selling packages</v-card-title>
              <v-card-subtitle>By revenue (₭)</v-card-subtitle>
            </v-card-item>
            <v-card-text><HBarChart :rows="packageRows" empty-text="No packages sold yet" /></v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" lg="6">
          <v-card class="bordered h-100">
            <v-card-item prepend-icon="mdi-database-outline">
              <v-card-title class="font-weight-bold">Packages in use now</v-card-title>
              <v-card-subtitle>Number of users with each active package</v-card-subtitle>
            </v-card-item>
            <v-card-text><HBarChart :rows="inUseRows" empty-text="No active package data yet" /></v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- recent purchases -->
      <v-card class="bordered mt-4">
        <v-card-item prepend-icon="mdi-cart-outline">
          <v-card-title class="font-weight-bold">Recent purchases</v-card-title>
          <v-card-subtitle>Click a row to see the full details</v-card-subtitle>
        </v-card-item>
        <v-data-table
          :headers="purchaseHeaders"
          :items="data.recent"
          :items-per-page="-1"
          hide-default-footer
          density="comfortable"
          hover
          @click:row="(_: unknown, { item }: { item: Purchase }) => navigateTo(`/events/${item.id}`)"
        >
          <template #item.occurredAt="{ item }">
            <div class="font-weight-bold text-mono">{{ formatTime(item.occurredAt) }}</div>
            <div class="text-caption text-medium-emphasis">
              {{ new Date(item.occurredAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) }}
            </div>
          </template>
          <template #item.buyer="{ item }">
            <div class="font-weight-medium">{{ item.userId ? fullName(item) : 'Unknown' }}</div>
            <div class="text-caption text-medium-emphasis text-mono">
              {{ formatPhone(item.msisdn) }}
              <template v-if="item.forWhom === 'other' && item.forNumber"> → for {{ formatPhone(String(item.forNumber).replace(/^0/, '')) }}</template>
            </div>
          </template>
          <template #item.package="{ item }">
            <div class="font-weight-bold">{{ item.name || (item.code ? `Package ${item.code}` : '—') }}</div>
            <div class="text-caption text-medium-emphasis">{{ [item.net, item.duration].filter(Boolean).join(' · ') }}</div>
          </template>
          <template #item.channel="{ item }">
            <span class="d-inline-flex align-center ga-1 text-body-2">
              <v-icon :icon="CHANNEL_META[item.channel]?.icon ?? 'mdi-wallet-outline'" size="16" />
              {{ CHANNEL_META[item.channel]?.label ?? item.channel }}
            </span>
          </template>
          <template #item.price="{ item }">
            <span class="font-weight-black" style="font-variant-numeric: tabular-nums">{{ item.price != null ? formatMoney(item.price) : '—' }}</span>
          </template>
          <template #item.success="{ item }">
            <v-chip v-if="item.success !== null" size="small" :color="item.success ? 'success' : 'error'" variant="flat" :prepend-icon="item.success ? 'mdi-check' : 'mdi-close'">
              {{ item.success ? 'Success' : 'Failed' }}
            </v-chip>
            <span v-else class="text-medium-emphasis">—</span>
          </template>
          <template #no-data>
            <div class="py-8 text-medium-emphasis">No purchases in the {{ periodText }}</div>
          </template>
        </v-data-table>
      </v-card>

      <!-- users by data left -->
      <v-card class="bordered mt-4">
        <v-card-item prepend-icon="mdi-database-alert-outline">
          <v-card-title class="font-weight-bold">Users with the least data left</v-card-title>
          <v-card-subtitle>From each user's latest package check in the app</v-card-subtitle>
        </v-card-item>
        <div class="low-list">
          <NuxtLink v-for="u in data.lowData" :key="u.id" :to="`/users/${u.id}`" class="low-item">
            <v-avatar color="primary" variant="tonal" size="36">
              <span class="text-caption font-weight-bold">{{ initials(u) }}</span>
            </v-avatar>
            <div class="flex-grow-1" style="min-width: 0">
              <div class="font-weight-bold text-truncate">{{ fullName(u) }}</div>
              <div class="text-caption text-medium-emphasis text-mono">{{ formatPhone(u.msisdn) }} · {{ u.packages }} package{{ u.packages === 1 ? '' : 's' }}</div>
            </div>
            <div class="text-right">
              <div class="font-weight-black" :class="(u.remainMb ?? 0) < 500 ? 'text-error' : ''">{{ formatMb(u.remainMb) }} left</div>
              <div class="text-caption text-medium-emphasis">checked {{ timeAgo(u.updatedAt) }}</div>
            </div>
            <v-icon icon="mdi-chevron-right" class="text-medium-emphasis" />
          </NuxtLink>
          <div v-if="!data.lowData.length" class="py-8 text-center text-medium-emphasis">No data balances recorded yet</div>
        </div>
      </v-card>
    </template>

    <div v-else-if="pending" class="d-flex justify-center py-16">
      <v-progress-circular indeterminate color="primary" />
    </div>
  </div>
</template>

<style scoped>
.range {
  display: flex;
  gap: 8px;
}
.range-btn {
  padding: 8px 14px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 0.88rem;
  background: rgb(var(--v-theme-surface));
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-on-surface), 0.12);
  cursor: pointer;
}
.range-btn.on {
  background: #1a1a1a;
  color: #fff;
  box-shadow: none;
}
.low-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
}
.low-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  color: inherit;
  text-decoration: none;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}
.low-item:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}
</style>
