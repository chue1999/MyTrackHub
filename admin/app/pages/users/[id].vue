<script setup lang="ts">
import type { AppUser, Paged, TrackedEvent } from '~/composables/useApi'

interface UserDetail {
  user: AppUser
  summary: { totalEvents: number; screenViews: number; taps: number; sessions: number; failed: number }
  topScreens: { name: string; count: number }[]
  devices: { deviceId: string; deviceModel: string | null; platform: string | null; lastUsedAt: string }[]
}

const api = useApi()
const route = useRoute()
const id = computed(() => String(route.params.id))

const { data: detail, error, refresh: refreshDetail } = await useAsyncData(`user-${id.value}`, () =>
  api<UserDetail>(`/users/${id.value}`),
)

const type = ref<string | null>(null)
const page = ref(1)
const pageSize = 50
const { data: events, pending } = await useAsyncData(
  `user-events-${id.value}`,
  () =>
    api<Paged<TrackedEvent>>('/events', {
      query: { userId: id.value, type: type.value || undefined, page: page.value, pageSize },
    }),
  { watch: [type, page] },
)
watch(type, () => (page.value = 1))
const pages = computed(() => Math.max(1, Math.ceil((events.value?.total ?? 0) / pageSize)))

const refreshDetailSoon = debounce(() => refreshDetail(), 1500)
useLive().onEvents(({ user, events: incoming }) => {
  if (user?.id !== id.value) return
  if (detail.value) detail.value = { ...detail.value, user: { ...detail.value.user, ...user } }
  const mine = incoming.filter((e) => !type.value || e.type === type.value)
  if (events.value && page.value === 1 && mine.length) {
    const known = new Set(events.value.items.map((e) => e.id))
    const fresh = mine.filter((e) => !known.has(e.id)).reverse()
    events.value = {
      ...events.value,
      items: [...fresh, ...events.value.items],
      total: events.value.total + fresh.length,
    }
  }
  refreshDetailSoon()
})
</script>

<template>
  <div>
    <v-btn to="/users" variant="text" prepend-icon="mdi-arrow-left" class="mb-4 text-none">All users</v-btn>

    <v-alert v-if="error" type="error" variant="tonal" :text="error.data?.message || 'Could not load this user'" />

    <template v-if="detail">
      <v-row>
        <v-col cols="12" lg="4">
          <v-card class="bordered">
            <v-card-text class="text-center pt-8">
              <v-avatar color="primary" size="80" class="mb-3">
                <span class="text-h5 font-weight-bold text-black">{{ initials(detail.user) }}</span>
              </v-avatar>
              <div class="text-h6 font-weight-bold">{{ fullName(detail.user) }}</div>
              <div class="text-body-1 text-mono text-medium-emphasis">{{ formatPhone(detail.user.msisdn) }}</div>
            </v-card-text>
            <v-divider />
            <v-list density="compact" class="py-2">
              <v-list-item prepend-icon="mdi-login" title="Logins" :subtitle="String(detail.user.loginCount)" />
              <v-list-item prepend-icon="mdi-clock-outline" title="Last active" :subtitle="`${timeAgo(detail.user.lastSeenAt)} · ${formatDateTime(detail.user.lastSeenAt)}`" />
              <v-list-item prepend-icon="mdi-account-clock-outline" title="Last login" :subtitle="formatDateTime(detail.user.lastLoginAt)" />
              <v-list-item prepend-icon="mdi-calendar-plus" title="First seen" :subtitle="formatDateTime(detail.user.firstSeenAt)" />
              <v-list-item
                :prepend-icon="detail.user.platform === 'ios' ? 'mdi-apple' : 'mdi-android'"
                title="Device"
                :subtitle="[detail.user.deviceModel, detail.user.appVersion && `app v${detail.user.appVersion}`].filter(Boolean).join(' · ') || '—'"
              />
            </v-list>
          </v-card>

          <v-row class="mt-1" dense>
            <v-col v-for="s in [
              { label: 'Actions', value: detail.summary.totalEvents, icon: 'mdi-lightning-bolt' },
              { label: 'Sessions', value: detail.summary.sessions, icon: 'mdi-timer-outline' },
              { label: 'Screens', value: detail.summary.screenViews, icon: 'mdi-cellphone-screenshot' },
              { label: 'Taps', value: detail.summary.taps, icon: 'mdi-gesture-tap' },
              { label: 'Failed', value: detail.summary.failed, icon: 'mdi-alert-circle-outline' },
              { label: 'Logins', value: detail.user.loginCount, icon: 'mdi-login' },
            ]" :key="s.label" cols="6">
              <v-card class="bordered">
                <v-card-text class="pa-3">
                  <v-icon :icon="s.icon" size="18" color="primary" />
                  <div class="text-h6 font-weight-bold">{{ s.value.toLocaleString() }}</div>
                  <div class="text-caption text-medium-emphasis">{{ s.label }}</div>
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>

          <v-card class="bordered mt-3">
            <v-card-item prepend-icon="mdi-star-outline">
              <v-card-title class="text-subtitle-1 font-weight-bold">Favourite screens</v-card-title>
            </v-card-item>
            <v-list density="compact">
              <v-list-item v-for="s in detail.topScreens" :key="s.name" :title="s.name">
                <template #append><v-chip size="small" variant="tonal">{{ s.count }}</v-chip></template>
              </v-list-item>
              <v-list-item v-if="!detail.topScreens.length" subtitle="No screens yet" />
            </v-list>
          </v-card>

          <v-card v-if="detail.devices.length" class="bordered mt-3">
            <v-card-item prepend-icon="mdi-cellphone-link">
              <v-card-title class="text-subtitle-1 font-weight-bold">Devices</v-card-title>
            </v-card-item>
            <v-list density="compact">
              <v-list-item
                v-for="d in detail.devices"
                :key="d.deviceId"
                :prepend-icon="d.platform === 'ios' ? 'mdi-apple' : 'mdi-android'"
                :title="d.deviceModel || d.deviceId"
                :subtitle="`Last used ${timeAgo(d.lastUsedAt)}`"
              />
            </v-list>
          </v-card>
        </v-col>

        <v-col cols="12" lg="8">
          <v-card class="bordered">
            <v-card-item prepend-icon="mdi-timeline-text-outline">
              <v-card-title class="font-weight-bold">Activity</v-card-title>
              <v-card-subtitle>{{ (events?.total ?? 0).toLocaleString() }} actions, newest first</v-card-subtitle>
              <template #append>
                <v-select
                  v-model="type"
                  :items="EVENT_TYPE_OPTIONS"
                  label="Type"
                  clearable
                  hide-details
                  density="compact"
                  style="width: 190px"
                />
              </template>
            </v-card-item>
            <v-card-text>
              <v-progress-linear v-if="pending" indeterminate color="primary" class="mb-2" />
              <EventTimeline :events="events?.items ?? []" />
              <div v-if="pages > 1" class="d-flex justify-center">
                <v-pagination v-model="page" :length="pages" :total-visible="7" density="comfortable" rounded="lg" />
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>
  </div>
</template>
