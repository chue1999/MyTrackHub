<script setup lang="ts">
interface ApiUsage {
  name: string
  uses: number
  succeeded: number
  failed: number
  users: number
  lastAt: string
}

const api = useApi()
const range = ref(lastDays(30))
const periodText = computed(() => rangeText(range.value))
const { data, pending, error, refresh } = await useAsyncData(
  'feature-usage',
  () => api<{ days: number; apis: ApiUsage[] }>('/stats/features', { query: { from: rangeIso(range.value.from), to: rangeIso(range.value.to, true) } }),
  { watch: [range] },
)
const refreshSoon = debounce(() => refresh(), 2000)
useLive().onEvents(({ events }) => {
  if (events.some((e) => e.type === 'api')) refreshSoon()
})

interface FeatureRow {
  key: string
  label: string
  icon: string
  uses: number
  succeeded: number
  failed: number
  users: number
  lastAt: string | null
  actions: { label: string; uses: number; failed: number }[]
  apis: string[]
}

/** Group API usage into features; features nobody used still appear. */
const rows = computed<FeatureRow[]>(() => {
  const map = new Map<string, FeatureRow>()
  const ensure = (key: string, label: string, icon: string, apis: string[]) => {
    if (!map.has(key)) map.set(key, { key, label, icon, uses: 0, succeeded: 0, failed: 0, users: 0, lastAt: null, actions: [], apis })
    return map.get(key)!
  }
  for (const f of FEATURES) ensure(f.key, f.label, f.icon, Object.keys(f.apis))
  for (const a of data.value?.apis ?? []) {
    const found = lookupApi(a.name)
    const row = found
      ? map.get(found.feature.key)!
      : ensure(OTHER_FEATURE.key, OTHER_FEATURE.label, OTHER_FEATURE.icon, [])
    row.uses += a.uses
    row.succeeded += a.succeeded
    row.failed += a.failed
    row.users = Math.max(row.users, a.users) // at least this many different users
    if (!row.lastAt || a.lastAt > row.lastAt) row.lastAt = a.lastAt
    const label = found?.label ?? apiLabel(a.name)
    const existing = row.actions.find((x) => x.label === label)
    if (existing) {
      existing.uses += a.uses
      existing.failed += a.failed
    } else row.actions.push({ label, uses: a.uses, failed: a.failed })
    if (!found) row.apis.push((a.name.split(' ')[1] ?? '').split('/').filter(Boolean).pop() ?? '')
  }
  for (const r of map.values()) r.actions.sort((x, y) => y.uses - x.uses)
  return [...map.values()].sort((a, b) => b.uses - a.uses)
})

const used = computed(() => rows.value.filter((r) => r.uses > 0))
const unused = computed(() => rows.value.filter((r) => r.uses === 0 && r.key !== 'other'))
const totals = computed(() => ({
  uses: used.value.reduce((s, r) => s + r.uses, 0),
  failed: used.value.reduce((s, r) => s + r.failed, 0),
}))
const rate = (r: FeatureRow) => {
  const checked = r.succeeded + r.failed
  return checked ? Math.round((r.succeeded / checked) * 100) : null
}
const open = (r: FeatureRow, failedOnly = false) =>
  navigateTo({ path: '/events', query: { feature: r.key, ...(failedOnly ? { result: 'failed' } : {}) } })
</script>

<template>
  <div>
    <div class="d-flex flex-wrap align-center ga-3 mb-6">
      <div>
        <h1 class="page-title">App features</h1>
        <div class="text-body-2 text-medium-emphasis">
          Every function of the MyTPlus app: how often it was used, by how many users, and how often it failed
        </div>
      </div>
      <v-spacer />
      <DateRange v-model="range" />
      <v-btn icon="mdi-refresh" variant="text" :loading="pending" @click="refresh()" />
    </div>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4" :text="error.data?.message || 'Could not load features'" />

    <template v-if="data">
      <v-row class="mb-2">
        <v-col cols="12" sm="4">
          <StatCard title="Features used" :value="`${used.filter((r) => r.key !== 'other').length} / ${FEATURES.length}`" icon="mdi-apps" />
        </v-col>
        <v-col cols="12" sm="4">
          <StatCard title="Actions" :value="totals.uses" icon="mdi-lightning-bolt" color="info" :hint="`${periodText}`" />
        </v-col>
        <v-col cols="12" sm="4">
          <StatCard title="Failed" :value="totals.failed" icon="mdi-close-circle-outline" color="error" />
        </v-col>
      </v-row>

      <div class="grid">
        <v-card v-for="r in used" :key="r.key" class="bordered feature" @click="open(r)">
          <div class="f-head">
            <div class="f-icon"><v-icon :icon="r.icon" size="24" /></div>
            <div class="flex-grow-1" style="min-width: 0">
              <div class="f-title">{{ r.label }}</div>
              <div class="f-sub">{{ r.users }}+ users · last used {{ r.lastAt ? timeAgo(r.lastAt) : '—' }}</div>
            </div>
            <div class="text-right">
              <div class="f-uses">{{ r.uses.toLocaleString() }}</div>
              <div class="f-sub">actions</div>
            </div>
          </div>

          <div class="f-rate">
            <div class="bar">
              <span class="ok" :style="{ flexGrow: r.succeeded }" />
              <span class="bad" :style="{ flexGrow: r.failed }" />
              <span class="unk" :style="{ flexGrow: Math.max(0, r.uses - r.succeeded - r.failed) }" />
            </div>
            <div class="d-flex justify-space-between text-caption mt-1">
              <span class="text-success font-weight-bold">
                {{ rate(r) != null ? `${rate(r)}% success` : 'Result not recorded' }}
              </span>
              <button v-if="r.failed" type="button" class="fail-link" @click.stop="open(r, true)">
                {{ r.failed }} failed →
              </button>
            </div>
          </div>

          <div class="f-actions">
            <div v-for="a in r.actions.slice(0, 4)" :key="a.label" class="f-action">
              <span class="text-truncate">{{ a.label }}</span>
              <span class="d-flex ga-2">
                <span v-if="a.failed" class="text-error font-weight-bold">{{ a.failed }} ✕</span>
                <strong>{{ a.uses.toLocaleString() }}</strong>
              </span>
            </div>
            <div v-if="r.actions.length > 4" class="text-caption text-medium-emphasis mt-1">+ {{ r.actions.length - 4 }} more</div>
          </div>
        </v-card>
      </div>

      <template v-if="unused.length">
        <div class="section-title mt-8 mb-3">
          <v-icon icon="mdi-sleep" size="18" /> Not used in this period ({{ periodText }})
        </div>
        <div class="unused">
          <div v-for="r in unused" :key="r.key" class="unused-item">
            <v-icon :icon="r.icon" size="18" />
            {{ r.label }}
          </div>
        </div>
      </template>
    </template>

    <div v-else-if="pending" class="d-flex justify-center py-16">
      <v-progress-circular indeterminate color="primary" />
    </div>
  </div>
</template>

<style scoped>
.range {
  display: flex;
  gap: 8px;
}
.range-btn {
  padding: 8px 14px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 0.88rem;
  background: rgb(var(--v-theme-surface));
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-on-surface), 0.12);
  cursor: pointer;
}
.range-btn.on {
  background: #1a1a1a;
  color: #fff;
  box-shadow: none;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
.feature {
  padding: 18px;
  cursor: pointer;
  transition: transform 0.15s;
}
.feature:hover {
  transform: translateY(-2px);
}
.f-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.f-icon {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: #8a5a00;
  background: rgba(252, 208, 33, 0.25);
}
.v-theme--dark .f-icon {
  color: #fcd021;
  background: rgba(252, 208, 33, 0.14);
}
.f-title {
  font-weight: 800;
  font-size: 1.02rem;
}
.f-sub {
  font-size: 0.78rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.f-uses {
  font-size: 1.5rem;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.f-rate {
  margin: 14px 0 12px;
}
.bar {
  display: flex;
  gap: 2px;
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.bar span {
  min-width: 0;
}
.bar .ok {
  background: var(--status-good);
}
.bar .bad {
  background: var(--status-critical);
}
.bar .unk {
  background: var(--status-unknown);
}
.fail-link {
  color: #c0392b;
  font-weight: 800;
  cursor: pointer;
}
.fail-link:hover {
  text-decoration: underline;
}
.f-actions {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  padding-top: 10px;
}
.f-action {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 3px 0;
  font-size: 0.85rem;
}
.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 800;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.unused {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.unused-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.85rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  border: 1px dashed rgba(var(--v-theme-on-surface), 0.2);
}
</style>
