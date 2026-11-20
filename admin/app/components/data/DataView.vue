<script setup lang="ts">
/**
 * Shows API data in a readable way instead of raw JSON:
 * - lists of objects become a table (one row per item)
 * - objects become labelled fields
 * - dates, money and long codes are formatted
 */
const props = withDefaults(defineProps<{ value: unknown; depth?: number }>(), { depth: 0 })

type Obj = Record<string, unknown>
/**
 * Row text like "('TP PK 25','prepaid','25','11 GB','25000','7 Days'),(…)" → rows.
 * (Older events kept this as text; it may end with "… (6642 chars)".)
 */
const TUPLE_COLUMNS: Record<string, string[]> = {
  packageUssdData: ['Package', 'SimType', 'PackageCode', 'Data', 'Price', 'Duration'],
}
function parseTuples(text: string, key = ''): { rows: Obj[]; shortenedFrom: number | null } | null {
  let t = text.trim()
  // Older events: "…,('TP POS CV2 100000k 35G… (6642 chars)" → keep only the complete rows.
  const cut = t.match(/… \((\d+) chars\)$/)
  if (cut) t = t.slice(0, cut.index).replace(/,?\s*\([^()]*$/, '')
  if (!t.startsWith('(') || !/\)\s*,\s*\(/.test(t)) return null
  const names = TUPLE_COLUMNS[key]
  const rows: Obj[] = []
  for (const m of t.matchAll(/\(((?:'(?:[^']|'')*'|[^()'])*)\)/g)) {
    const fields = [...m[1]!.matchAll(/'((?:[^']|'')*)'|([^,\s][^,]*)/g)].map((f) =>
      (f[1] ?? f[2] ?? '').replace(/''/g, "'").trim(),
    )
    const row: Obj = {}
    fields.forEach((f, i) => (row[names?.[i] ?? `Col ${i + 1}`] = /^\d+(\.\d+)?$/.test(f) ? Number(f) : f))
    rows.push(row)
  }
  return rows.length ? { rows, shortenedFrom: cut ? Number(cut[1]) : null } : null
}

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const isScalar = (v: unknown) => v === null || ['string', 'number', 'boolean'].includes(typeof v)

/** "PackageName" / "package_name" / "regisPackageType" → "Package name" / "Regis package type" */
function label(key: string) {
  const s = key
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim()
    .toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const MONEY = /price|amount|balance|fee|cost|total/i
const PHONE = /msisdn|tel|phone|receiver|mobile/i
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

/** Text for one value, formatted by what its key suggests. */
function show(key: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'number') return MONEY.test(key) ? `${v.toLocaleString('en-US')} ₭` : v.toLocaleString('en-US')
  const s = String(v).trim()
  if (ISO_DATE.test(s)) {
    const d = new Date(s)
    if (!Number.isNaN(+d))
      return d.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
  }
  if (PHONE.test(key) && /^\+?\d{8,13}$/.test(s)) return formatPhone(s.replace(/^\+?856/, '').replace(/^0/, ''))
  if (MONEY.test(key) && /^\d+(\.\d+)?$/.test(s)) return `${Number(s).toLocaleString('en-US')} ₭`
  return s
}
const tone = (key: string, v: unknown) => {
  if (/result ?desc|message|status/i.test(key) && typeof v === 'string') return 'strong'
  if (MONEY.test(key)) return 'money'
  if (PHONE.test(key) && /^\+?\d{8,13}$/.test(String(v ?? ''))) return 'phone'
  return ''
}

// For lists of objects: the union of keys, most useful columns first.
const PRIORITY = [
  /^(package)?name$|^package$|^counter ?name$|^title$/i,
  /code$/i,
  /price|amount|balance|total/i,
  /^net$|data|remain|used/i,
  /duration|validity/i,
  /date|time/i,
  /msisdn|tel|phone|receiver/i,
  /result ?desc|status|message/i,
]
const rank = (k: string) => {
  const i = PRIORITY.findIndex((re) => re.test(k.replace(/_/g, '')))
  return i === -1 ? PRIORITY.length : i
}
function columns(rows: unknown[]) {
  const cols: string[] = []
  for (const r of rows) if (isObj(r)) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k)
  return cols
    .map((k, i) => ({ k, i }))
    .sort((a, b) => rank(a.k) - rank(b.k) || a.i - b.i)
    .map((x) => x.k)
}
const isRowList = (v: unknown): v is unknown[] =>
  Array.isArray(v) && v.length > 0 && v.every((x) => isObj(x) || typeof x === 'string')

// Split an object into simple fields (shown as a grid) and nested parts.
const parts = computed(() => {
  const v = props.value
  if (!isObj(v)) return null
  const fields: [string, unknown][] = []
  const nested: [string, unknown][] = []
  const notes: string[] = []
  for (const [k, val] of Object.entries(v)) {
    const parsed = typeof val === 'string' ? parseTuples(val, k) : null
    if (parsed) {
      nested.push([k, parsed.rows])
      if (parsed.shortenedFrom)
        notes.push(
          `Only the first ${parsed.rows.length} rows of "${label(k)}" were recorded (older app version). Restart the app to record the full list.`,
        )
    } else (isScalar(val) ? fields : nested).push([k, val])
  }
  return { fields, nested, notes }
})

/** Long text is cut with "…"; clicking it shows (or hides) the whole text. */
function toggle(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement
  if (el.classList.contains('open') || el.scrollWidth > el.clientWidth) el.classList.toggle('open')
}
</script>

<template>
  <!-- list of objects → table -->
  <div v-if="isRowList(value)" class="dv-table-wrap">
    <table class="dv-table">
      <thead>
        <tr>
          <th class="num">#</th>
          <th v-for="c in columns(value as unknown[])" :key="c">{{ label(c) }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in value as unknown[]" :key="i">
          <td class="num">{{ i + 1 }}</td>
          <template v-if="isObj(row)">
            <td v-for="c in columns(value as unknown[])" :key="c" :class="tone(c, (row as Obj)[c])">
              <DataView v-if="!isScalar((row as Obj)[c])" :value="(row as Obj)[c]" :depth="depth + 1" />
              <div v-else class="clip cell" :title="show(c, (row as Obj)[c])" @click="toggle">
                {{ show(c, (row as Obj)[c]) }}
              </div>
            </td>
          </template>
          <!-- "… N more items" marker added by the app when a list was shortened -->
          <td v-else :colspan="columns(value as unknown[]).length" class="more">{{ row }}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- object → labelled fields, then its nested parts -->
  <div v-else-if="parts" class="dv-obj">
    <div v-if="parts.fields.length" class="dv-fields">
      <div v-for="[k, v] in parts.fields" :key="k" class="dv-field">
        <div class="dv-label">{{ label(k) }}</div>
        <div class="dv-value clip" :class="tone(k, v)" :title="show(k, v)" @click="toggle">{{ show(k, v) }}</div>
      </div>
    </div>
    <div v-for="n in parts.notes" :key="n" class="dv-note">
      <v-icon icon="mdi-information-outline" size="16" /> {{ n }}
    </div>
    <div v-for="[k, v] in parts.nested" :key="k" class="dv-section">
      <div class="dv-section-title">
        <v-icon :icon="Array.isArray(v) ? 'mdi-table' : 'mdi-folder-outline'" size="16" />
        {{ label(k) }}
        <span v-if="Array.isArray(v)" class="dv-count">{{ v.length }}</span>
      </div>
      <DataView :value="v" :depth="depth + 1" />
    </div>
    <div v-if="!parts.fields.length && !parts.nested.length" class="dv-empty">Empty</div>
  </div>

  <!-- list of plain values -->
  <div v-else-if="Array.isArray(value)" class="dv-chips">
    <span v-for="(x, i) in value" :key="i" class="dv-chip clip" :title="show('', x)" @click="toggle">{{
      show('', x)
    }}</span>
    <span v-if="!value.length" class="dv-empty">Empty list</span>
  </div>

  <!-- single value -->
  <div v-else class="dv-value clip" :title="show('', value)" @click="toggle">{{ show('', value) }}</div>
</template>

<style scoped>
.dv-fields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 8px;
}
.dv-field {
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  min-width: 0;
}
.dv-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.dv-value {
  font-size: 0.95rem;
  font-weight: 600;
}
.dv-value.strong {
  font-weight: 800;
}
.dv-value.money,
td.money {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dv-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 0.82rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
  background: rgba(47, 128, 237, 0.08);
}
.dv-section {
  margin-top: 14px;
}
.dv-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 0.85rem;
  font-weight: 800;
}
.dv-count {
  padding: 0 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  background: rgba(var(--v-theme-on-surface), 0.08);
}
.dv-table-wrap {
  overflow-x: auto;
  border-radius: 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
.dv-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.dv-table th {
  position: sticky;
  top: 0;
  text-align: left;
  padding: 8px 12px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
  color: rgba(var(--v-theme-on-surface), 0.6);
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.dv-table td {
  padding: 8px 12px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  vertical-align: top;
  white-space: nowrap;
}
.dv-table tbody tr:hover {
  background: rgba(var(--v-theme-primary), 0.06);
}
.dv-table .num {
  width: 32px;
  color: rgba(var(--v-theme-on-surface), 0.45);
}
.dv-table td.strong {
  font-weight: 700;
}
.dv-table td.more {
  font-style: italic;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.dv-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.dv-chip {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 0.85rem;
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.dv-empty {
  font-size: 0.85rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.clip {
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  cursor: default;
}
.clip.cell {
  max-width: 320px;
}
.dv-chip.clip {
  display: inline-block;
  max-width: 320px;
}
.clip.open {
  white-space: normal;
  overflow-wrap: anywhere;
  cursor: pointer;
}
.clip:not(.open):hover {
  cursor: pointer;
}
</style>
