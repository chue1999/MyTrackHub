<script setup lang="ts">
import type { AppUser, Paged } from '~/composables/useApi'

const api = useApi()
const route = useRoute()
const router = useRouter()

const search = ref(String(route.query.search || ''))
const debounced = ref(search.value)
let timer: ReturnType<typeof setTimeout> | undefined
watch(search, (v) => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    debounced.value = v.trim()
    page.value = 1
    router.replace({ query: v.trim() ? { search: v.trim() } : {} })
  }, 350)
})

// The top-bar quick search changes ?search= while this page is open.
watch(
  () => route.query.search,
  (q) => {
    const v = String(q || '')
    if (v !== search.value.trim()) search.value = v
  },
)

const page = ref(1)
const pageSize = ref(20)
// Only users who did something in this period (empty = everyone).
const range = ref({ from: '', to: '' })
watch(range, () => (page.value = 1))
const sort = ref<'lastSeenAt' | 'loginCount' | 'firstSeenAt' | 'dataRemainMb'>('lastSeenAt')

const { data, pending, error, refresh } = await useAsyncData(
  'users',
  () =>
    api<Paged<AppUser>>('/users', {
      query: {
        search: debounced.value,
        page: page.value,
        pageSize: pageSize.value,
        sort: sort.value,
        from: rangeIso(range.value.from),
        to: rangeIso(range.value.to, true),
      },
    }),
  { watch: [debounced, page, pageSize, sort, range] },
)

const headers = [
  { title: 'User', key: 'name', sortable: false },
  { title: 'Phone number', key: 'msisdn', sortable: false },
  { title: 'Data left', key: 'data', sortable: false },
  { title: 'Actions', key: 'actions', sortable: false, align: 'end' as const },
  { title: 'Logins', key: 'loginCount', sortable: false, align: 'end' as const },
  { title: 'Last active', key: 'lastSeenAt', sortable: false },
  { title: 'Device', key: 'device', sortable: false },
]

const refreshSoon = debounce(() => refresh(), 2000)
useLive().onEvents(() => refreshSoon())

function onOptions(o: { page: number; itemsPerPage: number }) {
  page.value = o.page
  pageSize.value = o.itemsPerPage
}
</script>

<template>
  <div>
    <div class="d-flex flex-wrap align-center ga-3 mb-6">
      <div>
        <h1 class="page-title">Users</h1>
        <div class="text-body-2 text-medium-emphasis">Everyone who has logged in to the app</div>
      </div>
    </div>

    <v-card class="bordered">
      <v-card-text class="d-flex flex-wrap ga-3">
        <v-text-field
          v-model="search"
          placeholder="Search by phone number or name"
          prepend-inner-icon="mdi-magnify"
          clearable
          hide-details
          style="min-width: 260px"
          class="flex-grow-1"
        />
        <DateRange v-model="range" clearable />
        <v-select
          v-model="sort"
          :items="[
            { title: 'Last active', value: 'lastSeenAt' },
            { title: 'Most logins', value: 'loginCount' },
            { title: 'Newest', value: 'firstSeenAt' },
            { title: 'Least data left', value: 'dataRemainMb' },
          ]"
          label="Sort by"
          hide-details
          style="max-width: 200px"
        />
      </v-card-text>

      <v-alert v-if="error" type="error" variant="tonal" class="mx-4" :text="error.data?.message || 'Could not load users'" />

      <v-data-table-server
        :headers="headers"
        :items="data?.items ?? []"
        :items-length="data?.total ?? 0"
        :loading="pending"
        :page="page"
        :items-per-page="pageSize"
        :items-per-page-options="[10, 20, 50, 100]"
        hover
        @update:options="onOptions"
        @click:row="(_: unknown, { item }: { item: AppUser }) => navigateTo(`/users/${item.id}`)"
      >
        <template #item.name="{ item }">
          <div class="d-flex align-center ga-3 py-2" style="cursor: pointer">
            <v-avatar color="primary" variant="tonal" size="36">
              <span class="text-body-2 font-weight-bold">{{ initials(item) }}</span>
            </v-avatar>
            <div class="font-weight-medium">{{ fullName(item) }}</div>
          </div>
        </template>
        <template #item.msisdn="{ item }">
          <span class="text-mono font-weight-bold phone" style="font-size: 0.95rem">{{ formatPhone(item.msisdn) }}</span>
        </template>
        <template #item.data="{ item }">
          <template v-if="item.packagesUpdatedAt">
            <div class="font-weight-bold" :class="(item.dataRemainMb ?? 0) < 500 ? 'text-error' : ''">{{ formatMb(item.dataRemainMb) }}</div>
            <div class="text-caption text-medium-emphasis">{{ item.packageCount }} package{{ item.packageCount === 1 ? '' : 's' }}</div>
          </template>
          <span v-else class="text-medium-emphasis">—</span>
        </template>
        <template #item.actions="{ item }">
          <div class="font-weight-bold">{{ (item.actionCount ?? 0).toLocaleString() }}</div>
          <div v-if="item.failedCount" class="text-caption text-error font-weight-bold">{{ item.failedCount }} failed</div>
        </template>
        <template #item.device="{ item }">
          <div class="d-flex align-center ga-1">
            <v-icon
              :icon="item.platform === 'ios' ? 'mdi-apple' : item.platform === 'android' ? 'mdi-android' : 'mdi-cellphone'"
              size="18"
            />
            <span class="text-body-2">{{ item.deviceModel || '—' }}</span>
          </div>
          <div class="text-caption text-medium-emphasis">{{ item.appVersion ? `v${item.appVersion}` : '' }}</div>
        </template>
        <template #item.lastSeenAt="{ item }">
          <span :title="formatDateTime(item.lastSeenAt)">{{ timeAgo(item.lastSeenAt) }}</span>
        </template>
        <template #item.firstSeenAt="{ item }">
          {{ formatDateTime(item.firstSeenAt) }}
        </template>
        <template #no-data>
          <div class="py-8 text-medium-emphasis">No users found</div>
        </template>
      </v-data-table-server>
    </v-card>
  </div>
</template>
