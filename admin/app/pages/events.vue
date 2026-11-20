<script setup lang="ts">
import type { Paged, TrackedEvent } from '~/composables/useApi'

const api = useApi()

const search = ref('')
const debounced = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
watch(search, (v) => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    debounced.value = (v || '').trim()
    page.value = 1
  }, 350)
})

const type = ref<string | null>(null)
const from = ref('')
const to = ref('')
const page = ref(1)
const pageSize = 50

const { data, pending, error, refresh } = await useAsyncData(
  'events',
  () =>
    api<Paged<TrackedEvent>>('/events', {
      query: {
        search: debounced.value || undefined,
        type: type.value || undefined,
        from: from.value ? new Date(`${from.value}T00:00:00`).toISOString() : undefined,
        to: to.value ? new Date(`${to.value}T23:59:59`).toISOString() : undefined,
        page: page.value,
        pageSize,
      },
    }),
  { watch: [debounced, type, from, to, page] },
)
watch([type, from, to], () => (page.value = 1))
const pages = computed(() => Math.max(1, Math.ceil((data.value?.total ?? 0) / pageSize)))

const missed = ref(0)
watch([debounced, type, from, to, page], () => (missed.value = 0))
useLive().onEvents(({ events }) => {
  const filtered = !!(debounced.value || type.value || from.value || to.value)
  if (!data.value || page.value !== 1 || filtered) {
    missed.value += events.length
    return
  }
  const known = new Set(data.value.items.map((e) => e.id))
  const fresh = events.filter((e) => !known.has(e.id)).reverse()
  // Replace the object: Nuxt 4 async data is shallow-reactive.
  data.value = {
    ...data.value,
    items: [...fresh, ...data.value.items].slice(0, pageSize),
    total: data.value.total + fresh.length,
  }
})
function showMissed() {
  missed.value = 0
  refresh()
}
</script>

<template>
  <div>
    <div class="d-flex flex-wrap align-center ga-3 mb-6">
      <div>
        <h1 class="text-h5 font-weight-bold">Activity log</h1>
        <div class="text-body-2 text-medium-emphasis">Every login, screen and tap from all users</div>
      </div>
      <v-spacer />
      <v-btn icon="mdi-refresh" variant="text" :loading="pending" @click="refresh()" />
    </div>

    <v-card class="bordered">
      <v-card-text>
        <v-row dense>
          <v-col cols="12" md="4">
            <v-text-field
              v-model="search"
              placeholder="Screen, button or phone number"
              prepend-inner-icon="mdi-magnify"
              clearable
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="4" md="3">
            <v-select v-model="type" :items="EVENT_TYPE_OPTIONS" label="Type" clearable hide-details />
          </v-col>
          <v-col cols="6" sm="4" md="2">
            <v-text-field v-model="from" type="date" label="From" hide-details />
          </v-col>
          <v-col cols="6" sm="4" md="2">
            <v-text-field v-model="to" type="date" label="To" hide-details />
          </v-col>
        </v-row>
        <div class="text-caption text-medium-emphasis mt-3">
          {{ (data?.total ?? 0).toLocaleString() }} results
        </div>
      </v-card-text>
      <v-divider />
      <v-card-text>
        <v-alert
          v-if="missed"
          type="info"
          variant="tonal"
          density="compact"
          class="mb-4"
          icon="mdi-bell-ring-outline"
        >
          {{ missed }} new action{{ missed > 1 ? 's' : '' }} since you opened this view
          <template #append>
            <v-btn size="small" variant="text" @click="showMissed">Show</v-btn>
          </template>
        </v-alert>
        <v-alert v-if="error" type="error" variant="tonal" class="mb-4" :text="error.data?.message || 'Could not load activity'" />
        <v-progress-linear v-if="pending" indeterminate color="primary" class="mb-2" />
        <EventTimeline :events="data?.items ?? []" show-user />
        <div v-if="pages > 1" class="d-flex justify-center">
          <v-pagination v-model="page" :length="pages" :total-visible="7" density="comfortable" rounded="lg" />
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>
