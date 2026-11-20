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

const open = ref<Set<string>>(new Set())
function toggle(id: string) {
  const s = new Set(open.value)
  s.has(id) ? s.delete(id) : s.add(id)
  open.value = s
}

const p = (e: TrackedEvent) => e.properties as Record<string, any>
const dotColor = (e: TrackedEvent) =>
  e.type === 'api' ? (e.success === false ? 'error' : e.success ? 'success' : 'purple') : EVENT_META[e.type]?.color

// Small extra properties shown as chips for non-API events.
const simpleProps = (e: TrackedEvent) =>
  Object.entries(e.properties ?? {}).filter(([, v]) => v === null || typeof v !== 'object')

const pretty = (v: unknown) => JSON.stringify(v, null, 2)
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
              <v-btn
                v-if="p(e).request || p(e).response"
                size="x-small"
                variant="text"
                density="comfortable"
                class="text-none"
                :append-icon="open.has(e.id) ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                @click="toggle(e.id)"
              >
                Details
              </v-btn>
            </div>
            <v-expand-transition>
              <div v-if="open.has(e.id)" class="mt-2 d-flex flex-column ga-2">
                <div v-if="p(e).request">
                  <div class="text-caption font-weight-bold mb-1">Sent (what the user asked for)</div>
                  <pre class="json">{{ pretty(p(e).request) }}</pre>
                </div>
                <div v-if="p(e).response">
                  <div class="text-caption font-weight-bold mb-1">Received (what they got)</div>
                  <pre class="json">{{ pretty(p(e).response) }}</pre>
                </div>
              </div>
            </v-expand-transition>
          </div>

          <!-- who -->
          <div v-if="showUser && e.user" class="text-body-2 mt-1">
            <NuxtLink :to="`/users/${e.user.id}`" class="text-decoration-none">
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
        </v-timeline-item>
      </v-timeline>
    </div>
    <div v-if="!events.length" class="text-center text-medium-emphasis py-10">
      <v-icon icon="mdi-timeline-clock-outline" size="48" class="mb-2" />
      <div>No activity found</div>
    </div>
  </div>
</template>

<style scoped>
.json {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.45;
  max-height: 320px;
  overflow: auto;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.05);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
