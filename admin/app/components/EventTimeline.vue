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

const hasProps = (e: TrackedEvent) => e.properties && Object.keys(e.properties).length > 0
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
          :dot-color="EVENT_META[e.type]?.color"
          :icon="EVENT_META[e.type]?.icon"
          size="small"
          fill-dot
        >
          <div class="d-flex flex-wrap align-center ga-2">
            <span class="text-caption text-medium-emphasis text-mono">{{ formatTime(e.occurredAt) }}</span>
            <span class="text-body-2 text-medium-emphasis">{{ EVENT_META[e.type]?.label }}</span>
            <span class="text-body-1 font-weight-bold">{{ e.name }}</span>
            <v-chip v-if="e.screen && e.screen !== e.name" size="x-small" variant="tonal" prepend-icon="mdi-cellphone">
              {{ e.screen }}
            </v-chip>
          </div>
          <div v-if="showUser && e.user" class="text-body-2 mt-1">
            <NuxtLink :to="`/users/${e.user.id}`" class="text-decoration-none">
              <v-icon icon="mdi-account" size="14" />
              {{ fullName(e.user) }} · {{ formatPhone(e.user.msisdn) }}
            </NuxtLink>
          </div>
          <div v-else-if="showUser && !e.user" class="text-caption text-medium-emphasis mt-1">Not logged in</div>
          <div v-if="hasProps(e)" class="mt-1">
            <v-chip
              v-for="(v, k) in e.properties"
              :key="k"
              size="x-small"
              variant="outlined"
              class="mr-1 mb-1 text-mono"
            >
              {{ k }}: {{ typeof v === 'object' ? JSON.stringify(v) : v }}
            </v-chip>
          </div>
        </v-timeline-item>
      </v-timeline>
    </div>
    <div v-if="!events.length" class="text-center text-medium-emphasis py-10">
      <v-icon icon="mdi-timeline-clock-outline" size="48" class="mb-2" />
      <div>No activity found</div>
    </div>
  </div>
</template>
