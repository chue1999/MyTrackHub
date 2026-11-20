<script setup lang="ts">
import type { TrackedEvent, JsonRecord } from '~/types/api'

const props = defineProps<{
  items: TrackedEvent[]
  total: number
  loading?: boolean
  showUser?: boolean
}>()
const page = defineModel<number>('page', { default: 1 })
const pageSize = defineModel<number>('pageSize', { default: 50 })

const headers = computed(() => [
  { title: 'Time', key: 'occurredAt', sortable: false, width: 150 },
  ...(props.showUser ? [{ title: 'User', key: 'user', sortable: false, width: 210 }] : []),
  { title: 'What they did', key: 'action', sortable: false },
  { title: 'Details', key: 'details', sortable: false },
  { title: 'Result', key: 'success', sortable: false, width: 110, align: 'center' as const },
  { title: '', key: 'open', sortable: false, width: 44 },
])

function open(e: TrackedEvent) {
  navigateTo(`/events/${e.id}`)
}

const iconColor = (e: TrackedEvent) => {
  if (e.type === 'api') return e.success === false ? 'error' : e.success ? 'success' : 'purple'
  if (e.type === 'logout') return e.name === 'logout_to_password' ? '#eb6834' : '#2a78d6'
  return EVENT_META[e.type]?.color
}
const iconOf = (e: TrackedEvent) =>
  e.type === 'logout' && e.name === 'logout_to_password' ? 'mdi-lock-clock' : EVENT_META[e.type]?.icon
const p = (e: TrackedEvent) => e.properties as JsonRecord

function onRowClick(_: unknown, { item }: { item: TrackedEvent }) {
  open(item)
}
</script>

<template>
  <div>
    <v-data-table-server
      v-model:page="page"
      v-model:items-per-page="pageSize"
      :headers="headers"
      :items="items"
      :items-length="total"
      :loading="loading"
      :items-per-page-options="[25, 50, 100, 200]"
      item-value="id"
      hover
      density="comfortable"
      class="event-table"
      @click:row="onRowClick"
    >
      <!-- time -->
      <template #item.occurredAt="{ item }">
        <div class="py-2">
          <div class="text-body-2 font-weight-bold text-mono">{{ formatTime(item.occurredAt) }}</div>
          <div class="text-caption text-medium-emphasis">
            {{
              new Date(item.occurredAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            }}
          </div>
        </div>
      </template>

      <!-- user -->
      <template #item.user="{ item }">
        <NuxtLink
          v-if="item.user"
          :to="`/users/${item.user.id}`"
          class="d-flex align-center ga-2 text-decoration-none user-link"
          @click.stop
        >
          <v-avatar color="primary" variant="tonal" size="32">
            <span class="text-caption font-weight-bold">{{ initials(item.user) }}</span>
          </v-avatar>
          <div style="min-width: 0">
            <div class="text-body-2 font-weight-medium text-truncate">{{ fullName(item.user) }}</div>
            <div class="text-caption text-medium-emphasis text-mono phone">{{ formatPhone(item.user.msisdn) }}</div>
          </div>
        </NuxtLink>
        <span v-else class="text-caption text-medium-emphasis">Not logged in</span>
      </template>

      <!-- action -->
      <template #item.action="{ item }">
        <div class="d-flex align-center ga-3 py-2">
          <v-avatar :color="iconColor(item)" variant="tonal" rounded="lg" size="34">
            <v-icon :icon="iconOf(item)" size="18" />
          </v-avatar>
          <div style="min-width: 0">
            <div class="text-body-2 font-weight-bold">{{ eventTitle(item) }}</div>
            <div class="text-caption text-medium-emphasis text-truncate" style="max-width: 280px">
              <span v-if="featureOf(item)" class="feature-tag">
                <v-icon :icon="featureOf(item)!.icon" size="13" />{{ featureOf(item)!.label }}
              </span>
              <template v-else>{{ EVENT_META[item.type]?.label }}</template>
              <template v-if="item.screen && item.type !== 'screen_view'"> · {{ screenLabel(item.screen) }}</template>
            </div>
          </div>
        </div>
      </template>

      <!-- details -->
      <template #item.details="{ item }">
        <div class="py-2">
          <div v-if="item.type === 'api' && apiSummaryLine(item)" class="summary">{{ apiSummaryLine(item) }}</div>
          <div
            v-if="item.result"
            class="text-body-2 text-truncate"
            style="max-width: 360px"
            :class="item.success === false ? 'text-error' : 'text-medium-emphasis'"
          >
            {{ item.result }}
          </div>
          <div v-if="item.type === 'api'" class="text-caption text-medium-emphasis text-mono">
            {{ item.name.split(' ')[0] }} {{ screenLabel(item.name.split(' ')[1] ?? '') }}
            <template v-if="p(item).ms != null"> · {{ p(item).ms }} ms</template>
          </div>
          <div v-else-if="item.type === 'logout' && p(item).reason" class="text-body-2 text-medium-emphasis">
            <v-icon
              :icon="item.name === 'logout_to_password' ? 'mdi-lock-clock' : 'mdi-logout'"
              size="14"
              class="mr-1"
            />{{ logoutReason(p(item).reason) }}
          </div>
          <div
            v-else-if="item.type === 'screen_view' && item.name.includes('/')"
            class="text-caption text-medium-emphasis text-mono text-truncate"
            style="max-width: 360px"
          >
            {{ item.name }}
          </div>
        </div>
      </template>

      <!-- result -->
      <template #item.success="{ item }">
        <v-chip
          v-if="item.success !== null && item.success !== undefined"
          size="small"
          :color="item.success ? 'success' : 'error'"
          variant="flat"
          :prepend-icon="item.success ? 'mdi-check' : 'mdi-close'"
        >
          {{ item.success ? 'Success' : 'Failed' }}
        </v-chip>
        <span v-else class="text-medium-emphasis">—</span>
      </template>

      <template #item.open>
        <v-icon icon="mdi-chevron-right" class="text-medium-emphasis" />
      </template>

      <template #no-data>
        <div class="py-10 text-medium-emphasis">
          <v-icon icon="mdi-timeline-clock-outline" size="40" class="mb-2" />
          <div>No activity found</div>
        </div>
      </template>
    </v-data-table-server>
  </div>
</template>

<style scoped>
.event-table :deep(tbody tr) {
  cursor: pointer;
}
.event-table :deep(thead th) {
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 0.72rem !important;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.6) !important;
}
.feature-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-weight: 700;
  color: #8a5a00;
}
.v-theme--dark .feature-tag {
  color: #fcd021;
}
.summary {
  display: inline-block;
  font-weight: 700;
  font-size: 0.875rem;
  padding: 2px 8px;
  margin-bottom: 2px;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.user-link {
  color: inherit;
}
</style>
