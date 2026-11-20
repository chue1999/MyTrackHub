<script setup lang="ts">
import type { Paged, TrackedEvent } from '~/composables/useApi'

const api = useApi()

// A link can open this page pre-filtered, e.g. /events?search=TransferBalance
const route = useRoute()
const initialSearch = String(route.query.search || '')
const search = ref(initialSearch)
const debounced = ref(initialSearch.trim())
watch(
  () => route.query.search,
  (v) => {
    const term = String(v || '')
    if (term !== search.value) search.value = term
  },
)
let timer: ReturnType<typeof setTimeout> | undefined
watch(search, (v) => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    debounced.value = (v || '').trim()
    page.value = 1
  }, 350)
})

// Filters can also come from the address, e.g. /events?result=failed&from=2026-11-20
const resultFromQuery = (v: unknown) => (v === 'failed' ? 'false' : v === 'success' ? 'true' : null)
const dateFromQuery = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : '')
const type = ref<string | null>((route.query.type as string) || null)
const result = ref<'true' | 'false' | null>(resultFromQuery(route.query.result))
const from = ref(dateFromQuery(route.query.from))
const to = ref(dateFromQuery(route.query.to))
watch(
  () => [route.query.result, route.query.from, route.query.to, route.query.type],
  () => {
    result.value = resultFromQuery(route.query.result)
    from.value = dateFromQuery(route.query.from)
    to.value = dateFromQuery(route.query.to)
    type.value = (route.query.type as string) || null
  },
)
const hasFilters = computed(() => !!(search.value || type.value || result.value || from.value || to.value))
function clearFilters() {
  search.value = ''
  type.value = null
  result.value = null
  from.value = ''
  to.value = ''
  navigateTo('/events', { replace: true })
}
const filterText = computed(() => {
  const parts: string[] = []
  if (result.value === 'false') parts.push('failed actions only')
  if (result.value === 'true') parts.push('successful actions only')
  if (from.value && from.value === to.value) parts.push(`on ${from.value}`)
  else {
    if (from.value) parts.push(`from ${from.value}`)
    if (to.value) parts.push(`until ${to.value}`)
  }
  return parts.join(', ')
})
const page = ref(1)
const pageSize = ref(50)

const { data, pending, error, refresh } = await useAsyncData(
  'events',
  () =>
    api<Paged<TrackedEvent>>('/events', {
      query: {
        search: debounced.value || undefined,
        type: type.value || undefined,
        success: result.value || undefined,
        from: from.value ? new Date(`${from.value}T00:00:00`).toISOString() : undefined,
        to: to.value ? new Date(`${to.value}T23:59:59`).toISOString() : undefined,
        page: page.value,
        pageSize: pageSize.value,
      },
    }),
  { watch: [debounced, type, result, from, to, page, pageSize] },
)
watch([type, result, from, to], () => (page.value = 1))


const missed = ref(0)
watch([debounced, type, result, from, to, page], () => (missed.value = 0))
useLive().onEvents(({ events }) => {
  const filtered = !!(debounced.value || type.value || result.value || from.value || to.value)
  if (!data.value || page.value !== 1 || filtered) {
    missed.value += events.length
    return
  }
  const known = new Set(data.value.items.map((e) => e.id))
  const fresh = events.filter((e) => !known.has(e.id)).reverse()
  // Replace the object: Nuxt 4 async data is shallow-reactive.
  data.value = {
    ...data.value,
    items: [...fresh, ...data.value.items].slice(0, pageSize.value),
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
        <h1 class="page-title">Activity log</h1>
        <div class="text-body-2 text-medium-emphasis">Every login, screen and tap from all users</div>
      </div>
      <v-spacer />
      <v-btn icon="mdi-refresh" variant="text" :loading="pending" @click="refresh()" />
    </div>

    <v-card class="bordered">
      <v-card-text>
        <v-row dense>
          <v-col cols="12" md="3">
            <v-text-field
              v-model="search"
              placeholder="Screen, API, message or phone"
              prepend-inner-icon="mdi-magnify"
              clearable
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="4" md="3">
            <v-select v-model="type" :items="EVENT_TYPE_OPTIONS" label="Type" clearable hide-details />
          </v-col>
          <v-col cols="12" sm="4" md="2">
            <v-select
              v-model="result"
              :items="[
                { title: 'Success', value: 'true' },
                { title: 'Failed', value: 'false' },
              ]"
              label="Result"
              clearable
              hide-details
            />
          </v-col>
          <v-col cols="6" sm="4" md="2">
            <v-text-field v-model="from" type="date" label="From" hide-details />
          </v-col>
          <v-col cols="6" sm="4" md="2">
            <v-text-field v-model="to" type="date" label="To" hide-details />
          </v-col>
        </v-row>
        <div class="d-flex align-center flex-wrap ga-3 mt-3">
          <div
            v-if="result === 'false'"
            class="filter-banner bad"
          >
            <v-icon icon="mdi-close-circle" size="18" />
            Showing {{ filterText }} · {{ (data?.total ?? 0).toLocaleString() }} found
          </div>
          <div v-else-if="filterText" class="filter-banner">
            <v-icon icon="mdi-filter-variant" size="18" />
            Showing {{ filterText }} · {{ (data?.total ?? 0).toLocaleString() }} found
          </div>
          <span v-else class="text-caption text-medium-emphasis">{{ (data?.total ?? 0).toLocaleString() }} results</span>
          <v-btn v-if="hasFilters" size="small" variant="text" class="text-none" prepend-icon="mdi-filter-remove-outline" @click="clearFilters">
            Show all
          </v-btn>
        </div>
      </v-card-text>
      <v-divider />
      <v-card-text v-if="missed || error" class="pb-0">
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
      </v-card-text>
      <EventTable
        v-model:page="page"
        v-model:page-size="pageSize"
        :items="data?.items ?? []"
        :total="data?.total ?? 0"
        :loading="pending"
        show-user
      />
    </v-card>
  </div>
</template>

<style scoped>
.filter-banner {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: 700;
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.filter-banner.bad {
  color: #c0392b;
  background: rgba(217, 68, 58, 0.1);
}
</style>
