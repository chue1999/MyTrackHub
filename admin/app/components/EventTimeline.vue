<script setup lang="ts">
import type { TrackedEvent } from '~/composables/useApi'

const props = defineProps<{ events: TrackedEvent[]; showUser?: boolean }>()

// Group by day so the timeline reads like a diary.
const groups = computed(() => {
  const map = new Map<string, TrackedEvent[]>()
  for (const e of props.events) {
    const key = new Date(e.occurredAt).toDateString()
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(e)
  }
  return [...map.entries()].map(([, items]) => ({ day: items[0]!.occurredAt, items }))
})

const selected = ref<TrackedEvent | null>(null)
const dialog = ref(false)
function show(e: TrackedEvent) {
  selected.value = e
  dialog.value = true
}

const p = (e: TrackedEvent) => e.properties as Record<string, any>
const dotColor = (e: TrackedEvent) =>
  e.type === 'api' ? (e.success === false ? 'error' : e.success ? 'success' : 'purple') : EVENT_META[e.type]?.color

// Small extra properties shown as chips for non-API events.
const simpleProps = (e: TrackedEvent) =>
  Object.entries(e.properties ?? {}).filter(([, v]) => v === null || typeof v !== 'object')

</script>

<template>
  <div>
    <div v-for="g in groups" :key="g.day" class="mb-4">
      <v-chip size="small" variant="flat" color="secondary" class="mb-2" prepend-icon="mdi-calendar">
        {{ formatDay(g.day) }}
      </v-chip>
      <v-timeline side="end" density="compact" align="start" truncate-line="both">
        <v-timeline-item
          v-for="e in g.items"
          :key="e.id"
          :dot-color="dotColor(e)"
          :icon="EVENT_META[e.type]?.icon"
          size="small"
          fill-dot
        >
          <div class="event-row" role="button" tabindex="0" @click="show(e)" @keydown.enter="show(e)">
          <!-- headline -->
          <div class="d-flex flex-wrap align-center ga-2">
            <span class="text-caption text-medium-emphasis text-mono">{{ formatTime(e.occurredAt) }}</span>
            <template v-if="e.type === 'api'">
              <span class="text-body-1 font-weight-bold">{{ apiLabel(e.name) }}</span>
              <v-chip
                v-if="e.success !== null"
                size="x-small"
                :color="e.success ? 'success' : 'error'"
                variant="flat"
                :prepend-icon="e.success ? 'mdi-check' : 'mdi-close'"
              >
                {{ e.success ? 'Success' : 'Failed' }}
              </v-chip>
            </template>
            <template v-else>
              <span class="text-body-2 text-medium-emphasis">{{ EVENT_META[e.type]?.label }}</span>
              <span class="text-body-1 font-weight-bold">{{ e.name }}</span>
            </template>
            <v-chip v-if="e.screen && e.screen !== e.name" size="x-small" variant="tonal" prepend-icon="mdi-cellphone">
              {{ e.screen }}
            </v-chip>
          </div>

          <!-- business summary: who → whom, how much -->
          <div v-if="e.type === 'api' && apiSummaryLine(e)" class="summary mt-1">
            <v-icon icon="mdi-swap-horizontal" size="16" class="mr-1" />{{ apiSummaryLine(e) }}
          </div>

          <!-- API result line -->
          <div v-if="e.type === 'api'" class="mt-1">
            <div v-if="e.result" class="text-body-2" :class="e.success === false ? 'text-error' : ''">
              <v-icon icon="mdi-message-text-outline" size="14" class="mr-1" />{{ e.result }}
            </div>
            <div class="d-flex flex-wrap align-center ga-2 mt-1 text-caption text-medium-emphasis">
              <span class="text-mono">{{ e.name }}</span>
              <span v-if="p(e).status">· HTTP {{ p(e).status }}</span>
              <span v-if="p(e).resultCode != null">· code {{ p(e).resultCode }}</span>
              <span v-if="p(e).ms != null">· {{ p(e).ms }} ms</span>
              <span class="text-primary font-weight-medium">· View details</span>
            </div>
          </div>

          <!-- who -->
          <div v-if="showUser && e.user" class="text-body-2 mt-1">
            <NuxtLink :to="`/users/${e.user.id}`" class="text-decoration-none" @click.stop>
              <v-icon icon="mdi-account" size="14" />
              {{ fullName(e.user) }} · {{ formatPhone(e.user.msisdn) }}
            </NuxtLink>
          </div>
          <div v-else-if="showUser && !e.user" class="text-caption text-medium-emphasis mt-1">Not logged in</div>

          <!-- extra info for taps / actions -->
          <div v-if="e.type !== 'api' && simpleProps(e).length" class="mt-1">
            <v-chip
              v-for="[k, v] in simpleProps(e)"
              :key="k"
              size="x-small"
              variant="outlined"
              class="mr-1 mb-1 text-mono"
            >
              {{ k }}: {{ v }}
            </v-chip>
          </div>
          </div>
        </v-timeline-item>
      </v-timeline>
    </div>
    <div v-if="!events.length" class="text-center text-medium-emphasis py-10">
      <v-icon icon="mdi-timeline-clock-outline" size="48" class="mb-2" />
      <div>No activity found</div>
    </div>
    <EventDetailDialog v-model="dialog" :event="selected" />
  </div>
</template>

<style scoped>
.event-row {
  cursor: pointer;
  border-radius: 12px;
  padding: 6px 10px;
  margin: -6px -10px;
  transition: background 0.15s;
}
.event-row:hover,
.event-row:focus-visible {
  background: rgba(var(--v-theme-primary), 0.08);
  outline: none;
}
.summary {
  display: inline-flex;
  align-items: center;
  font-weight: 700;
  font-size: 0.95rem;
  padding: 4px 10px;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.05);
}
</style>
