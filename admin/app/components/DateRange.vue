<script setup lang="ts">
/**
 * Start / end date-time picker with quick presets.
 * v-model: { from: 'YYYY-MM-DDTHH:mm' | '', to: 'YYYY-MM-DDTHH:mm' | '' } in local time.
 * Empty values mean "no limit" (all time) when `clearable` is set.
 */
export interface Range {
  from: string
  to: string
}

const model = defineModel<Range>({ required: true })
const props = withDefaults(defineProps<{ clearable?: boolean; dense?: boolean }>(), { clearable: false, dense: false })

const open = ref(false)
const draft = reactive<Range>({ from: '', to: '' })
watch(open, (o) => {
  if (o) Object.assign(draft, model.value)
})

const pad = (n: number) => String(n).padStart(2, '0')
const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0)
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59)

const PRESETS: { key: string; label: string; make: () => Range }[] = [
  { key: 'today', label: 'Today', make: () => ({ from: local(startOfDay(new Date())), to: local(endOfDay(new Date())) }) },
  {
    key: 'yesterday',
    label: 'Yesterday',
    make: () => {
      const y = new Date(Date.now() - 86_400_000)
      return { from: local(startOfDay(y)), to: local(endOfDay(y)) }
    },
  },
  { key: '7d', label: 'Last 7 days', make: () => ({ from: local(startOfDay(new Date(Date.now() - 6 * 86_400_000))), to: local(endOfDay(new Date())) }) },
  { key: '14d', label: 'Last 14 days', make: () => ({ from: local(startOfDay(new Date(Date.now() - 13 * 86_400_000))), to: local(endOfDay(new Date())) }) },
  { key: '30d', label: 'Last 30 days', make: () => ({ from: local(startOfDay(new Date(Date.now() - 29 * 86_400_000))), to: local(endOfDay(new Date())) }) },
  {
    key: 'month',
    label: 'This month',
    make: () => {
      const n = new Date()
      return { from: local(new Date(n.getFullYear(), n.getMonth(), 1, 0, 0)), to: local(endOfDay(n)) }
    },
  },
  { key: '90d', label: 'Last 90 days', make: () => ({ from: local(startOfDay(new Date(Date.now() - 89 * 86_400_000))), to: local(endOfDay(new Date())) }) },
]

function choose(p: (typeof PRESETS)[number]) {
  model.value = p.make()
  open.value = false
}
function apply() {
  model.value = { from: draft.from, to: draft.to }
  open.value = false
}
function clear() {
  model.value = { from: '', to: '' }
  open.value = false
}

const fmt = (v: string) =>
  new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const activePreset = computed(() =>
  PRESETS.find((p) => {
    const r = p.make()
    return r.from === model.value.from && r.to === model.value.to
  }),
)
const label = computed(() => {
  const { from, to } = model.value
  if (!from && !to) return props.clearable ? 'All time' : 'Choose dates'
  if (activePreset.value) return activePreset.value.label
  if (from && to) return `${fmt(from)} → ${fmt(to)}`
  return from ? `From ${fmt(from)}` : `Until ${fmt(to)}`
})
const isSet = computed(() => !!(model.value.from || model.value.to))
const invalid = computed(() => !!(draft.from && draft.to && draft.from > draft.to))
</script>

<template>
  <v-menu v-model="open" :close-on-content-click="false" location="bottom end" offset="6">
    <template #activator="{ props: act }">
      <button v-bind="act" type="button" class="dr-btn" :class="{ set: isSet, dense }">
        <v-icon icon="mdi-calendar-clock" size="18" />
        <span class="dr-label">{{ label }}</span>
        <v-icon icon="mdi-chevron-down" size="18" />
      </button>
    </template>

    <v-card class="dr-card" rounded="xl" width="380">
      <div class="dr-section">Quick choices</div>
      <div class="dr-presets">
        <button
          v-for="p in PRESETS"
          :key="p.key"
          type="button"
          class="dr-preset"
          :class="{ on: activePreset?.key === p.key }"
          @click="choose(p)"
        >
          {{ p.label }}
        </button>
        <button v-if="clearable" type="button" class="dr-preset" :class="{ on: !isSet }" @click="clear">All time</button>
      </div>

      <div class="dr-section">Custom start and end</div>
      <div class="px-4">
        <v-text-field v-model="draft.from" type="datetime-local" label="Start date & time" density="comfortable" hide-details class="mb-3" />
        <v-text-field v-model="draft.to" type="datetime-local" label="End date & time" density="comfortable" hide-details />
        <div v-if="invalid" class="text-caption text-error mt-2">The start must be before the end.</div>
      </div>
      <div class="d-flex justify-end ga-2 pa-4">
        <v-btn v-if="clearable" variant="text" class="text-none" @click="clear">Clear</v-btn>
        <v-btn color="secondary" variant="flat" class="text-none" :disabled="invalid || (!draft.from && !draft.to)" @click="apply">
          Apply
        </v-btn>
      </div>
    </v-card>
  </v-menu>
</template>

<style scoped>
.dr-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 12px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 0.9rem;
  white-space: nowrap;
  background: rgb(var(--v-theme-surface));
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-on-surface), 0.16);
  cursor: pointer;
  max-width: 100%;
}
.dr-btn.dense {
  height: 40px;
}
.dr-btn.set {
  box-shadow: inset 0 0 0 2px rgb(var(--v-theme-primary));
}
.dr-label {
  overflow: hidden;
  text-overflow: ellipsis;
}
.dr-card {
  padding-bottom: 0;
}
.dr-section {
  padding: 14px 16px 8px;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.dr-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 16px;
}
.dr-preset {
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 600;
  background: rgba(var(--v-theme-on-surface), 0.06);
  cursor: pointer;
}
.dr-preset.on {
  background: #1a1a1a;
  color: #fff;
}
</style>
