<script setup lang="ts">
interface Retention {
  enabled: boolean
  months: number
  monthOptions: number[]
  updatedAt?: string
  updatedBy?: string
  lastRun: { at: string; deleted: number; cutoff: string; months: number; by: string; ms: number } | null
  preview: { months: number; cutoff: string; willDelete: number }
  total: number
  oldest: string | null
}

const api = useApi()
const { admin: me } = useAuth()
const canEdit = computed(() => me.value?.role === 'admin')

const info = ref<Retention | null>(null)
const form = reactive({ enabled: true, months: 4 })
const loading = ref(true)
const saving = ref(false)
const running = ref(false)
const confirm = ref<'save' | 'run' | null>(null)
const error = ref('')
const snack = reactive({ show: false, text: '', color: 'success' })

function apply(r: Retention) {
  info.value = r
  form.enabled = r.enabled
  form.months = r.months
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    apply(await api<Retention>('/settings/retention'))
  } catch (e: any) {
    error.value = e?.data?.message || 'Could not load the settings'
  } finally {
    loading.value = false
  }
}
onMounted(load)

// Live count of what the selected period would delete.
const preview = ref<Retention['preview'] | null>(null)
watch(
  () => form.months,
  async (m) => {
    if (!info.value) return
    if (m === info.value.preview.months) return (preview.value = info.value.preview)
    try {
      preview.value = (await api<Retention>('/settings/retention', { query: { months: m } })).preview
    } catch {
      preview.value = null
    }
  },
)
const shown = computed(() => preview.value ?? info.value?.preview ?? null)
const changed = computed(() => !!info.value && (form.enabled !== info.value.enabled || form.months !== info.value.months))
const MONTH_ITEMS = computed(() =>
  (info.value?.monthOptions ?? [1, 2, 3, 4, 6, 12]).map((m) => ({
    value: m,
    title: m % 12 === 0 ? `${m / 12} year${m > 12 ? 's' : ''} (${m} months)` : `${m} month${m > 1 ? 's' : ''}`,
  })),
)
const keepText = computed(() => MONTH_ITEMS.value.find((i) => i.value === form.months)?.title ?? `${form.months} months`)

function askSave() {
  // Turning it on (or shortening the period) deletes logs right away, so confirm first.
  if (form.enabled && (shown.value?.willDelete ?? 0) > 0) confirm.value = 'save'
  else save()
}

async function save() {
  confirm.value = null
  saving.value = true
  try {
    const before = info.value?.total ?? 0
    apply(await api<Retention>('/settings/retention', { method: 'PUT', body: { enabled: form.enabled, months: form.months } }))
    preview.value = null
    const deleted = Math.max(0, before - (info.value?.total ?? 0))
    Object.assign(snack, { show: true, color: 'success', text: deleted ? `Saved. Deleted ${deleted.toLocaleString()} old logs` : 'Saved' })
  } catch (e: any) {
    Object.assign(snack, { show: true, color: 'error', text: e?.data?.message || 'Could not save' })
  } finally {
    saving.value = false
  }
}

async function runNow() {
  confirm.value = null
  running.value = true
  try {
    apply(await api<Retention>('/settings/retention/run', { method: 'POST' }))
    preview.value = null
    const n = info.value?.lastRun?.deleted ?? 0
    Object.assign(snack, { show: true, color: 'success', text: n ? `Deleted ${n.toLocaleString()} old logs` : 'Nothing to delete' })
  } catch (e: any) {
    Object.assign(snack, { show: true, color: 'error', text: e?.data?.message || 'Could not delete' })
  } finally {
    running.value = false
  }
}
</script>

<template>
  <div>
    <div class="mb-6">
      <h1 class="page-title">Log storage</h1>
      <div class="text-body-2 text-medium-emphasis">How long the tracking system keeps its logs</div>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" rounded="lg" class="mb-4" :text="error" />
    <v-alert v-if="!canEdit" type="info" variant="tonal" rounded="lg" class="mb-4" icon="mdi-eye-outline">
      You can see these settings. Only administrators can change them.
    </v-alert>

    <v-card class="bordered" :loading="loading">
      <div class="head">
        <div class="head-icon"><v-icon icon="mdi-delete-clock-outline" size="26" /></div>
        <div class="flex-grow-1">
          <div class="text-h6 font-weight-black">Auto delete old logs</div>
          <div class="text-body-2 text-medium-emphasis">Logs older than the chosen period are deleted automatically every hour</div>
        </div>
        <v-switch v-model="form.enabled" :disabled="!canEdit || loading" color="success" inset hide-details :label="form.enabled ? 'On' : 'Off'" />
      </div>

      <v-divider />

      <v-card-text class="pa-5">
        <v-row>
          <v-col cols="12" md="5">
            <div class="label">Keep logs for</div>
            <v-select
              v-model="form.months"
              :items="MONTH_ITEMS"
              :disabled="!canEdit || loading || !form.enabled"
              prepend-inner-icon="mdi-calendar-range"
              hide-details
              density="comfortable"
            />
            <div class="text-caption text-medium-emphasis mt-2">
              <template v-if="form.enabled">Every log older than {{ keepText }} is deleted for good. It cannot be brought back.</template>
              <template v-else>Auto delete is off: all logs are kept forever.</template>
            </div>
          </v-col>

          <v-col cols="12" md="7">
            <div class="facts">
              <div class="fact">
                <div class="fact-label">Logs stored now</div>
                <div class="fact-value">{{ (info?.total ?? 0).toLocaleString() }}</div>
                <div class="fact-sub">Oldest: {{ info?.oldest ? formatDateTime(info.oldest) : '—' }}</div>
              </div>
              <div class="fact" :class="{ warn: form.enabled && (shown?.willDelete ?? 0) > 0 }">
                <div class="fact-label">Older than {{ keepText }}</div>
                <div class="fact-value">{{ (shown?.willDelete ?? 0).toLocaleString() }}</div>
                <div class="fact-sub">Before {{ shown ? formatDateTime(shown.cutoff) : '—' }}</div>
              </div>
            </div>
          </v-col>
        </v-row>

        <div class="last-run mt-5">
          <v-icon icon="mdi-history" size="18" />
          <span v-if="info?.lastRun">
            Last clean-up {{ timeAgo(info.lastRun.at) }} ({{ formatDateTime(info.lastRun.at) }}):
            <strong>{{ info.lastRun.deleted.toLocaleString() }}</strong> logs deleted, older than {{ info.lastRun.months }} months
            <span class="text-medium-emphasis">· by {{ info.lastRun.by }}</span>
            <span v-if="info?.updatedBy" class="text-medium-emphasis"> · setting changed by {{ info.updatedBy }} {{ timeAgo(info.updatedAt) }}</span>
          </span>
          <span v-else>No clean-up has run yet</span>
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions v-if="canEdit" class="pa-4 ga-3 flex-wrap">
        <v-btn
          variant="tonal"
          color="error"
          class="text-none"
          prepend-icon="mdi-delete-sweep-outline"
          :loading="running"
          :disabled="loading || saving || changed"
          @click="confirm = 'run'"
        >
          Delete old logs now
        </v-btn>
        <span v-if="changed" class="text-caption text-medium-emphasis">Save first to delete with the new period</span>
        <v-spacer />
        <v-btn variant="text" class="text-none" :disabled="!changed || saving" @click="info && apply(info)">Cancel</v-btn>
        <v-btn color="primary" variant="flat" class="text-none px-6" prepend-icon="mdi-content-save-outline" :loading="saving" :disabled="!changed" @click="askSave">
          Save
        </v-btn>
      </v-card-actions>
    </v-card>

    <v-dialog :model-value="!!confirm" max-width="440" @update:model-value="(v) => !v && (confirm = null)">
      <v-card class="pa-2">
        <v-card-title class="d-flex align-center ga-2 font-weight-black">
          <v-icon icon="mdi-alert-circle-outline" color="error" /> Delete old logs?
        </v-card-title>
        <v-card-text>
          <strong>{{ (shown?.willDelete ?? 0).toLocaleString() }}</strong> logs older than {{ keepText }}
          (before {{ shown ? formatDateTime(shown.cutoff) : '' }}) will be deleted for good. This cannot be undone.
          <div class="mt-2 text-medium-emphasis">Tip: export them on the Reports page first if you need a copy.</div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" class="text-none" @click="confirm = null">Cancel</v-btn>
          <v-btn color="error" variant="flat" class="text-none" @click="confirm === 'run' ? runNow() : save()">
            {{ confirm === 'run' ? 'Delete now' : 'Save and delete' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="3500" location="bottom right">{{ snack.text }}</v-snackbar>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
}
.head-icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: #8a5a00;
  background: rgba(252, 208, 33, 0.25);
}
.v-theme--dark .head-icon {
  color: #fcd021;
  background: rgba(252, 208, 33, 0.14);
}
.label {
  font-size: 0.8rem;
  font-weight: 800;
  margin-bottom: 8px;
}
.facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}
.fact {
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.fact.warn {
  background: rgba(192, 57, 43, 0.08);
}
.fact.warn .fact-value {
  color: #c0392b;
}
.fact-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.fact-value {
  font-size: 1.6rem;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}
.fact-sub {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.last-run {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 0.85rem;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.04);
}
</style>
