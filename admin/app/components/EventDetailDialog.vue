<script setup lang="ts">
import type { TrackedEvent } from '~/composables/useApi'

const model = defineModel<boolean>({ default: false })
const props = defineProps<{ event: TrackedEvent | null }>()

const e = computed(() => props.event)
const p = computed(() => (e.value?.properties ?? {}) as Record<string, any>)
const isApi = computed(() => e.value?.type === 'api')
const summary = computed(() => (e.value && isApi.value ? apiSummary(e.value) : []))
const title = computed(() =>
  !e.value ? '' : isApi.value ? apiLabel(e.value.name) : `${EVENT_META[e.value.type]?.label} · ${e.value.name}`,
)
const status = computed(() => {
  if (!e.value || e.value.success == null) return null
  return e.value.success
    ? { color: 'success', icon: 'mdi-check-circle', text: 'Success' }
    : { color: 'error', icon: 'mdi-close-circle', text: 'Failed' }
})
const pretty = (v: unknown) => JSON.stringify(v, null, 2)
const otherProps = computed(() =>
  Object.entries(p.value).filter(([k]) => !['request', 'response'].includes(k)),
)
</script>

<template>
  <v-dialog v-model="model" max-width="760" scrollable>
    <v-card v-if="e" rounded="xl">
      <!-- status banner -->
      <div
        class="pa-5 d-flex align-center ga-4"
        :class="status ? `bg-${status.color}` : 'bg-surface-variant'"
      >
        <v-avatar size="52" color="white" variant="flat">
          <v-icon
            :icon="status?.icon ?? EVENT_META[e.type]?.icon"
            :color="status?.color ?? EVENT_META[e.type]?.color"
            size="34"
          />
        </v-avatar>
        <div class="flex-grow-1" style="min-width: 0">
          <div class="text-h6 font-weight-black text-truncate">{{ title }}</div>
          <div class="text-body-2" style="opacity: 0.9">
            {{ status?.text ?? EVENT_META[e.type]?.label }} · {{ formatDay(e.occurredAt) }} {{ formatTime(e.occurredAt) }}
          </div>
        </div>
        <v-btn icon="mdi-close" variant="text" @click="model = false" />
      </div>

      <v-card-text class="pa-5">
        <!-- server message -->
        <v-alert
          v-if="e.result"
          :type="e.success === false ? 'error' : 'success'"
          variant="tonal"
          rounded="lg"
          class="mb-4"
          icon="mdi-message-text-outline"
        >
          <div class="text-caption">Server answer</div>
          <div class="text-body-1 font-weight-bold">{{ e.result }}</div>
        </v-alert>

        <!-- who -->
        <div class="d-flex align-center ga-3 mb-4">
          <v-avatar color="primary" size="40">
            <span class="font-weight-bold text-black">{{ initials(e.user) }}</span>
          </v-avatar>
          <div>
            <div class="font-weight-bold">{{ e.user ? fullName(e.user) : 'Not logged in' }}</div>
            <div class="text-mono text-body-2 text-medium-emphasis">{{ formatPhone(e.user?.msisdn ?? e.msisdn) }}</div>
          </div>
          <v-spacer />
          <v-btn v-if="e.user" :to="`/users/${e.user.id}`" variant="tonal" size="small" class="text-none" @click="model = false">
            Open user
          </v-btn>
        </div>

        <!-- business summary -->
        <v-card v-if="summary.length" class="bordered mb-4" rounded="lg">
          <v-list density="comfortable" class="py-0">
            <v-list-item v-for="row in summary" :key="row.label" :prepend-icon="row.icon">
              <v-list-item-subtitle>{{ row.label }}</v-list-item-subtitle>
              <v-list-item-title :class="row.strong ? 'text-h6 font-weight-black' : 'font-weight-medium'">
                {{ row.value }}
              </v-list-item-title>
            </v-list-item>
          </v-list>
        </v-card>

        <!-- technical -->
        <div class="text-subtitle-2 font-weight-bold mb-2">Details</div>
        <v-table density="compact" class="mb-4 bordered rounded-lg">
          <tbody>
            <tr v-if="isApi"><td class="text-medium-emphasis" style="width: 160px">API</td><td class="text-mono">{{ e.name }}</td></tr>
            <tr v-if="p.host"><td class="text-medium-emphasis">Server</td><td class="text-mono">{{ p.host }}</td></tr>
            <tr v-if="p.status"><td class="text-medium-emphasis">HTTP status</td><td>{{ p.status }}</td></tr>
            <tr v-if="p.resultCode != null"><td class="text-medium-emphasis">Result code</td><td>{{ p.resultCode }}</td></tr>
            <tr v-if="p.ms != null"><td class="text-medium-emphasis">Time taken</td><td>{{ p.ms }} ms</td></tr>
            <tr v-if="p.error"><td class="text-medium-emphasis">Error</td><td>{{ p.error }}</td></tr>
            <tr v-if="e.screen"><td class="text-medium-emphasis">Screen</td><td>{{ e.screen }}</td></tr>
            <tr v-for="[k, v] in isApi ? [] : otherProps" :key="k">
              <td class="text-medium-emphasis">{{ k }}</td><td class="text-mono">{{ typeof v === 'object' ? JSON.stringify(v) : v }}</td>
            </tr>
            <tr><td class="text-medium-emphasis">Device</td><td>{{ [e.deviceModel, e.platform, e.appVersion && `app v${e.appVersion}`].filter(Boolean).join(' · ') || '—' }}</td></tr>
            <tr v-if="e.sessionId"><td class="text-medium-emphasis">Session</td><td class="text-mono text-caption">{{ e.sessionId }}</td></tr>
            <tr><td class="text-medium-emphasis">Event id</td><td class="text-mono">{{ e.id }}</td></tr>
          </tbody>
        </v-table>

        <template v-if="p.request">
          <div class="text-subtitle-2 font-weight-bold mb-1">Sent: what the user asked for</div>
          <pre class="json mb-4">{{ pretty(p.request) }}</pre>
        </template>
        <template v-if="p.response">
          <div class="text-subtitle-2 font-weight-bold mb-1">Received: what they got</div>
          <pre class="json">{{ pretty(p.response) }}</pre>
        </template>
        <div v-if="isApi && !p.request && !p.response" class="text-caption text-medium-emphasis">
          This call was recorded by an older version of the app, before request and response details were captured.
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.json {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.45;
  max-height: 340px;
  overflow: auto;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.05);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
