<script setup lang="ts">
interface Overview {
  totals: { totalUsers: number; newUsersToday: number; activeToday: number; eventsToday: number; loginsToday: number }
  daily: { date: string; activeUsers: number; events: number; logins: number }[]
  topScreens: { name: string; count: number; users: number }[]
  topTaps: { name: string; count: number; users: number }[]
}

const api = useApi()
const days = ref(14)
const { data, pending, error, refresh } = await useAsyncData(
  'overview',
  () => api<Overview>('/stats/overview', { query: { days: days.value } }),
  { watch: [days] },
)

const metric = ref<'activeUsers' | 'logins' | 'events'>('activeUsers')
const series = computed(() => data.value?.daily.map((d) => d[metric.value]) ?? [])
const labels = computed(() => data.value?.daily.map((d) => d.date.slice(5)) ?? [])
const maxOf = (rows: { count: number }[]) => Math.max(1, ...rows.map((r) => r.count))
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
        <v-btn :value="7">7 days</v-btn>
        <v-btn :value="14">14 days</v-btn>
        <v-btn :value="30">30 days</v-btn>
      </v-btn-toggle>
      <v-btn icon="mdi-refresh" variant="text" :loading="pending" @click="refresh()" />
    </div>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4" :text="error.data?.message || 'Could not load the dashboard'" />

    <template v-if="data">
      <v-row>
        <v-col cols="12" sm="6" lg="3">
          <StatCard title="All users" :value="data.totals.totalUsers" icon="mdi-account-group" :hint="`+${data.totals.newUsersToday} new today`" />
        </v-col>
        <v-col cols="12" sm="6" lg="3">
          <StatCard title="Active today" :value="data.totals.activeToday" icon="mdi-account-clock" color="success" />
        </v-col>
        <v-col cols="12" sm="6" lg="3">
          <StatCard title="Logins today" :value="data.totals.loginsToday" icon="mdi-login" color="info" />
        </v-col>
        <v-col cols="12" sm="6" lg="3">
          <StatCard title="Actions today" :value="data.totals.eventsToday" icon="mdi-gesture-tap" color="warning" />
        </v-col>
      </v-row>

      <v-card class="bordered mt-4">
        <v-card-item>
          <v-card-title class="font-weight-bold">Daily trend</v-card-title>
          <template #append>
            <v-chip-group v-model="metric" mandatory selected-class="text-primary">
              <v-chip value="activeUsers" filter variant="outlined">Active users</v-chip>
              <v-chip value="logins" filter variant="outlined">Logins</v-chip>
              <v-chip value="events" filter variant="outlined">Actions</v-chip>
            </v-chip-group>
          </template>
        </v-card-item>
        <v-card-text>
          <v-sparkline
            :model-value="series"
            :labels="labels"
            color="primary"
            line-width="2"
            padding="16"
            smooth="8"
            auto-draw
            fill
            gradient-direction="top"
            :gradient="['rgba(245,184,0,0.05)', 'rgba(245,184,0,0.45)']"
            label-size="4"
            height="36"
            show-labels
          />
        </v-card-text>
      </v-card>

      <v-row class="mt-2">
        <v-col v-for="block in [
          { title: 'Most opened screens', icon: 'mdi-cellphone-screenshot', rows: data.topScreens, color: 'info' },
          { title: 'Most tapped buttons', icon: 'mdi-gesture-tap', rows: data.topTaps, color: 'warning' },
        ]" :key="block.title" cols="12" md="6">
          <v-card class="bordered h-100">
            <v-card-item :prepend-icon="block.icon">
              <v-card-title class="font-weight-bold">{{ block.title }}</v-card-title>
              <v-card-subtitle>Last {{ days }} days</v-card-subtitle>
            </v-card-item>
            <v-card-text>
              <div v-for="(r, i) in block.rows" :key="r.name" class="mb-3">
                <div class="d-flex align-center text-body-2 mb-1">
                  <span class="text-medium-emphasis mr-2" style="width: 20px">{{ i + 1 }}</span>
                  <span class="font-weight-medium text-truncate">{{ r.name }}</span>
                  <v-spacer />
                  <span class="font-weight-bold">{{ r.count.toLocaleString() }}</span>
                  <span class="text-caption text-medium-emphasis ml-2">· {{ r.users }} users</span>
                </div>
                <v-progress-linear :model-value="(r.count / maxOf(block.rows)) * 100" :color="block.color" rounded height="6" />
              </div>
              <div v-if="!block.rows.length" class="text-medium-emphasis text-center py-6">No data yet</div>
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
