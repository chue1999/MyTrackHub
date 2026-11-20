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

const page = ref(1)
const pageSize = ref(20)
const sort = ref<'lastSeenAt' | 'loginCount' | 'firstSeenAt'>('lastSeenAt')

const { data, pending, error } = await useAsyncData(
  'users',
  () =>
    api<Paged<AppUser>>('/users', {
      query: { search: debounced.value, page: page.value, pageSize: pageSize.value, sort: sort.value },
    }),
  { watch: [debounced, page, pageSize, sort] },
)

const headers = [
  { title: 'User', key: 'name', sortable: false },
  { title: 'Phone', key: 'msisdn', sortable: false },
  { title: 'Device', key: 'device', sortable: false },
  { title: 'Logins', key: 'loginCount', sortable: false, align: 'end' as const },
  { title: 'Last active', key: 'lastSeenAt', sortable: false },
  { title: 'First seen', key: 'firstSeenAt', sortable: false },
]

function onOptions(o: { page: number; itemsPerPage: number }) {
  page.value = o.page
  pageSize.value = o.itemsPerPage
}
</script>

<template>
  <div>
    <div class="d-flex flex-wrap align-center ga-3 mb-6">
      <div>
        <h1 class="text-h5 font-weight-bold">Users</h1>
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
        <v-select
          v-model="sort"
          :items="[
            { title: 'Last active', value: 'lastSeenAt' },
            { title: 'Most logins', value: 'loginCount' },
            { title: 'Newest', value: 'firstSeenAt' },
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
          <span class="text-mono">{{ formatPhone(item.msisdn) }}</span>
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
