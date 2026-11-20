<script setup lang="ts">
import type { Row } from '~/utils/reports'

const api = useApi()
const route = useRoute()

const reportKey = ref(REPORT_BY_KEY[String(route.query.report)] ? String(route.query.report) : 'activity')
const report = computed(() => REPORT_BY_KEY[reportKey.value]!)

// filters
const range = ref(lastDays(30))
const search = ref('')
const feature = ref<string | null>(null)
const result = ref<'true' | 'false' | null>(null)
const FEATURE_OPTIONS = FEATURES.map((f) => ({ title: f.label, value: f.key }))
const RESULT_OPTIONS = [
  { title: 'Success', value: 'true' },
  { title: 'Failed', value: 'false' },
]
const filters = computed(() => ({
  from: rangeIso(range.value.from),
  to: rangeIso(range.value.to, true),
  search: report.value.filters.includes('search') ? search.value.trim() : '',
  feature: report.value.filters.includes('feature') ? feature.value : null,
  result: report.value.filters.includes('result') ? result.value : null,
}))
const filtersText = computed(() => {
  const f = filters.value
  return [
    f.search && `search "${f.search}"`,
    f.feature && `feature ${FEATURE_BY_KEY[f.feature]?.label}`,
    f.result === 'true' && 'successful only',
    f.result === 'false' && 'failed only',
  ]
    .filter(Boolean)
    .join(', ')
})

// data
const rows = ref<Row[]>([])
const total = ref(0)
const loading = ref(false)
const progress = ref({ loaded: 0, total: 0 })
const error = ref('')
const loadedFor = ref('') // which report + filters the rows belong to
const stamp = computed(() => JSON.stringify([reportKey.value, filters.value]))
const stale = computed(() => loadedFor.value !== stamp.value)

async function load() {
  loading.value = true
  error.value = ''
  progress.value = { loaded: 0, total: 0 }
  try {
    const res = await report.value.load(api as any, filters.value, (loaded, t) => (progress.value = { loaded, total: t }))
    rows.value = res.rows
    total.value = res.total
    loadedFor.value = stamp.value
  } catch (e: any) {
    error.value = e?.data?.message || 'Could not load the report'
  } finally {
    loading.value = false
  }
}

const exporting = ref(false)
async function exportNow() {
  if (stale.value) await load()
  if (error.value) return
  exporting.value = true
  try {
    const day = new Date().toISOString().slice(0, 10)
    await exportExcel({
      title: `MyTPlus: ${report.value.label}`,
      periodText: rangeText(range.value),
      filtersText: filtersText.value,
      columns: report.value.columns,
      rows: rows.value,
      summary: report.value.summary(rows.value),
      fileName: `mytplus-${report.value.key}-${day}.xlsx`,
      truncatedFrom: total.value > rows.value.length ? total.value : null,
    })
  } catch (e: any) {
    error.value = `Could not create the Excel file: ${e?.message ?? e}`
  } finally {
    exporting.value = false
  }
}

watch(reportKey, (k) => {
  navigateTo({ query: { report: k } }, { replace: true })
  load()
})
onMounted(load)

const summary = computed(() => report.value.summary(rows.value))
const previewRows = computed(() => rows.value.slice(0, 100))
const pct = computed(() => (progress.value.total ? Math.round((progress.value.loaded / progress.value.total) * 100) : 0))
</script>

<template>
  <div>
    <div class="d-flex flex-wrap align-center ga-3 mb-6">
      <div>
        <h1 class="page-title">Reports</h1>
        <div class="text-body-2 text-medium-emphasis">Choose a report, set the period and filters, check the preview, then export to Excel</div>
      </div>
    </div>

    <!-- 1. choose report -->
    <div class="step">1. Choose a report</div>
    <div class="report-grid mb-6">
      <button
        v-for="r in REPORTS"
        :key="r.key"
        type="button"
        class="report-card"
        :class="{ on: reportKey === r.key }"
        @click="reportKey = r.key"
      >
        <div class="rc-icon"><v-icon :icon="r.icon" size="22" /></div>
        <div class="text-left" style="min-width: 0">
          <div class="rc-title">{{ r.label }}</div>
          <div class="rc-desc">{{ r.description }}</div>
        </div>
        <v-icon v-if="reportKey === r.key" icon="mdi-check-circle" class="rc-check" />
      </button>
    </div>

    <!-- 2. filters -->
    <div class="step">2. Period and filters</div>
    <v-card class="bordered mb-6">
      <v-card-text class="d-flex flex-wrap align-center ga-3">
        <DateRange v-model="range" />
        <v-text-field
          v-if="report.filters.includes('search')"
          v-model="search"
          placeholder="Search name, phone, action or message"
          prepend-inner-icon="mdi-magnify"
          clearable
          hide-details
          density="comfortable"
          style="min-width: 260px; flex: 1"
          @keydown.enter="load"
        />
        <v-select
          v-if="report.filters.includes('feature')"
          v-model="feature"
          :items="FEATURE_OPTIONS"
          label="Feature"
          clearable
          hide-details
          density="comfortable"
          style="width: 220px"
        />
        <v-select
          v-if="report.filters.includes('result')"
          v-model="result"
          :items="RESULT_OPTIONS"
          label="Result"
          clearable
          hide-details
          density="comfortable"
          style="width: 150px"
        />
        <v-spacer />
        <v-btn variant="tonal" class="text-none" prepend-icon="mdi-eye-outline" :loading="loading && !exporting" @click="load">
          Show preview
        </v-btn>
        <v-btn
          color="success"
          variant="flat"
          class="text-none"
          prepend-icon="mdi-microsoft-excel"
          :loading="exporting || (loading && exporting)"
          :disabled="loading"
          @click="exportNow"
        >
          Export to Excel
        </v-btn>
      </v-card-text>
      <v-progress-linear v-if="loading" :model-value="pct" :indeterminate="!progress.total" color="primary" height="4" />
      <div v-if="loading && progress.total > 5000" class="px-4 pb-3 text-caption text-medium-emphasis">
        Loading {{ progress.loaded.toLocaleString() }} of {{ progress.total.toLocaleString() }} rows…
      </div>
    </v-card>

    <v-alert v-if="error" type="error" variant="tonal" rounded="lg" class="mb-4" :text="error" />

    <!-- 3. preview -->
    <div class="step d-flex align-center ga-2">
      3. Preview
      <v-chip v-if="stale && rows.length" size="small" color="warning" variant="tonal" prepend-icon="mdi-refresh">
        Filters changed: press "Show preview" or export to refresh
      </v-chip>
    </div>
    <v-row class="mb-2">
      <v-col v-for="s in summary" :key="s.label" cols="12" sm="6" md="3">
        <v-card class="bordered pa-4">
          <div class="text-caption text-medium-emphasis font-weight-bold">{{ s.label }}</div>
          <div class="text-h5 font-weight-black">{{ previewCell(s.value, s.type) }}</div>
        </v-card>
      </v-col>
    </v-row>

    <v-alert v-if="total > rows.length" type="info" variant="tonal" rounded="lg" class="mb-3" icon="mdi-information-outline">
      {{ total.toLocaleString() }} rows match. The export includes the first {{ rows.length.toLocaleString() }}. Choose a shorter period to get everything.
    </v-alert>

    <v-card class="bordered">
      <div class="preview-head">
        <span>
          <strong>{{ report.label }}</strong> · {{ rangeText(range) }}
          <template v-if="filtersText"> · {{ filtersText }}</template>
        </span>
        <span class="text-medium-emphasis">
          {{ rows.length.toLocaleString() }} rows<template v-if="rows.length > 100"> (showing the first 100)</template>
        </span>
      </div>
      <div class="table-wrap">
        <table class="preview">
          <thead>
            <tr>
              <th class="num">#</th>
              <th v-for="c in report.columns" :key="c.key" :class="{ right: ['money', 'number', 'percent'].includes(c.type ?? '') }">
                {{ c.header }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in previewRows" :key="i">
              <td class="num">{{ i + 1 }}</td>
              <td
                v-for="c in report.columns"
                :key="c.key"
                :class="[
                  { right: ['money', 'number', 'percent'].includes(c.type ?? ''), mono: c.type === 'phone' },
                  c.type === 'result' && r[c.key] === 'Success' ? 'ok' : '',
                  c.type === 'result' && r[c.key] === 'Failed' ? 'bad' : '',
                ]"
              >
                {{ previewCell(r[c.key], c.type) }}
              </td>
            </tr>
            <tr v-if="!rows.length && !loading">
              <td :colspan="report.columns.length + 1" class="empty">Nothing found for this period and filters</td>
            </tr>
          </tbody>
        </table>
      </div>
    </v-card>
  </div>
</template>

<style scoped>
.step {
  font-size: 0.8rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(var(--v-theme-on-surface), 0.55);
  margin-bottom: 10px;
}
.report-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.report-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgb(var(--v-theme-surface));
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-on-surface), 0.1);
  cursor: pointer;
  transition: box-shadow 0.15s, transform 0.15s;
}
.report-card:hover {
  transform: translateY(-1px);
}
.report-card.on {
  box-shadow: inset 0 0 0 2px rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.08);
}
.rc-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: #8a5a00;
  background: rgba(252, 208, 33, 0.25);
}
.v-theme--dark .rc-icon {
  color: #fcd021;
  background: rgba(252, 208, 33, 0.14);
}
.rc-title {
  font-weight: 800;
}
.rc-desc {
  font-size: 0.8rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.rc-check {
  position: absolute;
  top: 10px;
  right: 10px;
  color: #d9a400;
}
.preview-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 16px;
  font-size: 0.9rem;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
.table-wrap {
  overflow: auto;
  max-height: 620px;
}
.preview {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.preview th {
  position: sticky;
  top: 0;
  z-index: 1;
  text-align: left;
  padding: 10px 12px;
  white-space: nowrap;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.6);
  background: rgb(var(--v-theme-surface));
  box-shadow: inset 0 -1px 0 rgba(var(--v-theme-on-surface), 0.1);
}
.preview td {
  padding: 8px 12px;
  white-space: nowrap;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}
.preview tbody tr:hover {
  background: rgba(var(--v-theme-primary), 0.06);
}
.preview .num {
  width: 40px;
  color: rgba(var(--v-theme-on-surface), 0.45);
}
.preview .right {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.preview .mono {
  font-family: var(--app-font);
}
.preview .ok {
  color: #1d8a4a;
  font-weight: 700;
}
.preview .bad {
  color: #c0392b;
  font-weight: 700;
}
.preview .empty {
  text-align: center;
  padding: 32px;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
</style>
