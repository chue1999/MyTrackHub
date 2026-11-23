<script setup lang="ts">
/**
 * SQL console (administrators only) for two servers: PostgreSQL (the API's own
 * database) and SQL Server. Browse databases and tables on the left, type SQL,
 * run it and see the results as tables, like in SSMS / pgAdmin.
 */
type ConnId = 'postgres' | 'mssql'
interface Connection {
  id: ConnId
  label: string
  host: string
  enabled: boolean
}
interface Status {
  enabled: boolean
  server?: string
  login?: string
  version?: string
  defaultDatabase?: string
  maxRows?: number
}
interface DbObject {
  schema: string
  name: string
  kind: 'table' | 'view' | 'procedure' | 'function'
  rows: number | null
}
interface Column {
  name: string
  type: string
  nullable: boolean
  isKey: boolean
}
interface ResultSet {
  columns: { name: string; type: string }[]
  rows: unknown[][]
  total: number
  truncated: boolean
}
interface QueryResult {
  resultSets: ResultSet[]
  messages: string[]
  error: { message: string; number?: number | string; line?: number } | null
  durationMs: number
  maxRows: number
}

useHead({ title: 'SQL Query' })
const api = useApi()
const { admin: me } = useAuth()
if (me.value?.role !== 'admin') await navigateTo('/')

// ── connection: the database this API runs on (PostgreSQL in dev, SQL Server in prod) ──
const conn = ref<ConnId>('postgres')
const isMssql = computed(() => conn.value === 'mssql')
const connLabel = computed(() => (isMssql.value ? 'SQL Server' : 'PostgreSQL'))
const status = ref<Status | null>(null)
const statusError = ref('')
const databases = ref<{ name: string; system: boolean }[]>([])
const db = ref('')

async function connect() {
  statusError.value = ''
  status.value = null
  databases.value = []
  objects.value = []
  const prev = db.value
  try {
    const [server] = await api<Connection[]>('/sql/connections')
    if (server && server.id !== conn.value) {
      conn.value = server.id
      sqlText.value = load(`sql_text_${server.id}`) || DEFAULT_SQL[server.id]
    }
    status.value = await api<Status>('/sql/status')
    databases.value = await api('/sql/databases')
    db.value = status.value.defaultDatabase ?? databases.value[0]?.name ?? ''
    if (db.value === prev) loadObjects()
  } catch (e) {
    statusError.value = errorMessage(e, `Cannot reach ${connLabel.value}.`)
  }
}
onMounted(connect)

// Per-browser conveniences only: the last database and the editor text.
function load(key: string) {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // storage blocked: nothing to remember
  }
}

// ── object explorer ──
const objects = ref<DbObject[]>([])
const objectsLoading = ref(false)
const objectsError = ref('')
const search = ref('')
const openGroups = ref<string[]>(['table'])
const expanded = ref<Record<string, Column[] | 'loading' | undefined>>({})

watch(db, loadObjects)

async function loadObjects() {
  const name = db.value
  if (!name) return
  objects.value = []
  expanded.value = {}
  objectsError.value = ''
  objectsLoading.value = true
  try {
    objects.value = await api<DbObject[]>('/sql/objects', { query: { db: name } })
  } catch (e) {
    objectsError.value = errorMessage(e, 'Could not load tables.')
  } finally {
    objectsLoading.value = false
  }
}

const GROUPS = [
  { kind: 'table', label: 'Tables', icon: 'mdi-table' },
  { kind: 'view', label: 'Views', icon: 'mdi-table-eye' },
  { kind: 'procedure', label: 'Stored procedures', icon: 'mdi-cog-play-outline' },
  { kind: 'function', label: 'Functions', icon: 'mdi-function-variant' },
] as const

const grouped = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = q ? objects.value.filter((o) => `${o.schema}.${o.name}`.toLowerCase().includes(q)) : objects.value
  return GROUPS.map((g) => ({ ...g, items: list.filter((o) => o.kind === g.kind) }))
})

/** Name quoted the way the current server wants: [x] for SQL Server, "x" for PostgreSQL. */
const q = (n: string) => (isMssql.value ? `[${n.replace(/]/g, ']]')}]` : `"${n.replace(/"/g, '""')}"`)
const fullName = (o: DbObject) => `${q(o.schema)}.${q(o.name)}`
const key = (o: DbObject) => `${o.schema}.${o.name}`

function toggleGroup(kind: string) {
  openGroups.value = openGroups.value.includes(kind)
    ? openGroups.value.filter((k) => k !== kind)
    : [...openGroups.value, kind]
}

async function toggleColumns(o: DbObject) {
  const k = key(o)
  if (expanded.value[k]) {
    expanded.value[k] = undefined
    return
  }
  expanded.value[k] = 'loading'
  try {
    expanded.value[k] = await api<Column[]>('/sql/columns', {
      query: { db: db.value, schema: o.schema, name: o.name },
    })
  } catch {
    expanded.value[k] = undefined
  }
}

function selectTop(o: DbObject) {
  setEditor(isMssql.value ? `SELECT TOP (1000) *\nFROM ${fullName(o)};` : `SELECT *\nFROM ${fullName(o)}\nLIMIT 1000;`)
  run()
}
function scriptFor(o: DbObject) {
  if (o.kind === 'procedure') return isMssql.value ? `EXEC ${fullName(o)};` : `CALL ${fullName(o)}();`
  if (o.kind === 'function') return `SELECT * FROM ${fullName(o)}();`
  return `SELECT COUNT(*) AS ${q('rows')} FROM ${fullName(o)};`
}

// ── editor ──
const editor = ref<HTMLTextAreaElement | null>(null)
const DEFAULT_SQL: Record<ConnId, string> = {
  mssql: 'SELECT TOP (100) name, create_date\nFROM sys.tables\nORDER BY name;',
  postgres: "SELECT table_name\nFROM information_schema.tables\nWHERE table_schema = 'public'\nORDER BY table_name;",
}
const sqlText = ref(load(`sql_text_${conn.value}`) || DEFAULT_SQL[conn.value])
watch(sqlText, (v) => save(`sql_text_${conn.value}`, v))

function setEditor(text: string) {
  sqlText.value = text
  nextTick(() => editor.value?.focus())
}
function insertAtCursor(text: string) {
  const el = editor.value
  if (!el) return setEditor(sqlText.value + text)
  const { selectionStart: a, selectionEnd: b } = el
  sqlText.value = sqlText.value.slice(0, a) + text + sqlText.value.slice(b)
  nextTick(() => {
    el.focus()
    el.selectionStart = el.selectionEnd = a + text.length
  })
}
function onEditorKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    run()
  } else if (e.key === 'F5') {
    e.preventDefault()
    run()
  } else if (e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault()
    insertAtCursor('    ')
  }
}
const lineCount = computed(() => sqlText.value.split('\n').length)

// ── running ──
const running = ref(false)
const result = ref<QueryResult | null>(null)
const runError = ref('')
const tab = ref<number | 'messages'>(0)
const ranText = ref('')
const resultConn = ref<ConnId>('postgres')

/** Statements that change or remove a lot at once ask first. */
function riskyReason(text: string) {
  const t = text.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  if (/\b(DROP|TRUNCATE)\s+(TABLE|DATABASE|VIEW|PROCEDURE|FUNCTION|SCHEMA)\b/i.test(t))
    return 'This removes a table, database or other object. It cannot be undone.'
  const statements = t.split(';')
  if (statements.some((s) => /^\s*(DELETE|UPDATE)\b/im.test(s) && !/\bWHERE\b/i.test(s)))
    return 'This DELETE or UPDATE has no WHERE, so it changes every row in the table.'
  return ''
}
const confirm = ref({ open: false, reason: '', text: '' })

function run() {
  if (running.value || !db.value) return
  const el = editor.value
  const selected =
    el && el.selectionEnd > el.selectionStart ? sqlText.value.slice(el.selectionStart, el.selectionEnd) : ''
  const text = (selected || sqlText.value).trim()
  if (!text) return
  const reason = riskyReason(text)
  if (reason) {
    confirm.value = { open: true, reason, text }
    return
  }
  execute(text)
}

async function execute(text: string) {
  confirm.value.open = false
  running.value = true
  runError.value = ''
  ranText.value = text
  resultConn.value = conn.value
  try {
    const r = await api<QueryResult>('/sql/query', {
      method: 'POST',
      body: { db: db.value, sql: text },
    })
    result.value = r
    tab.value = r.error || !r.resultSets.length ? 'messages' : 0
  } catch (e) {
    result.value = null
    runError.value = errorMessage(e, 'The query could not be sent.')
  } finally {
    running.value = false
  }
}

const current = computed(() => (typeof tab.value === 'number' ? (result.value?.resultSets[tab.value] ?? null) : null))

// ── cells ──
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/
const pad = (n: number) => String(n).padStart(2, '0')
function localTime(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
/**
 * Cell text. Times: PostgreSQL dates/times and SQL Server datetimeoffset are real
 * moments, so show them in local (Laos) time; SQL Server datetime/date have no
 * time zone, so show them exactly as stored.
 */
function showCell(v: unknown, type = '') {
  if (v === null) return 'NULL'
  if (typeof v === 'boolean') return resultConn.value === 'postgres' ? String(v) : v ? '1' : '0'
  if (typeof v === 'string' && ISO.test(v)) {
    if (resultConn.value === 'postgres' || type.startsWith('datetimeoffset')) {
      return type === 'date' ? localTime(v).slice(0, 10) : localTime(v)
    }
    return v.replace('T', ' ').replace(/(\.\d{3})?Z$/, (_m, ms) => ms ?? '')
  }
  return String(v)
}
const isNumberCol = (t: string) => /int|decimal|numeric|money|float|real/.test(t)

const copied = ref(false)
async function copyCell(v: unknown, type?: string) {
  try {
    await navigator.clipboard.writeText(v === null ? '' : showCell(v, type))
    copied.value = true
  } catch {
    // clipboard blocked
  }
}

// ── export ──
async function exportCurrent() {
  const rs = current.value
  if (!rs) return
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Result', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = rs.columns.map((c, i) => ({ header: c.name || `(No column name ${i + 1})`, width: 18 }))
  ws.getRow(1).font = { bold: true }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCD021' } }
  for (const r of rs.rows)
    ws.addRow(
      r.map((v, i) =>
        v === null ? null : typeof v === 'string' && ISO.test(v) ? showCell(v, rs.columns[i]?.type) : v,
      ),
    )
  const buf = await wb.xlsx.writeBuffer()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  )
  a.download = `${db.value}-result-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.xlsx`
  a.click()
  URL.revokeObjectURL(a.href)
}

const fmt = (n: number) => n.toLocaleString('en-US')
</script>

<template>
  <div class="sql-page">
    <div class="sql-grid">
      <!-- object explorer -->
      <v-card class="bordered explorer">
        <div class="pa-3 pb-2">
          <div v-if="statusError" class="conn-error">
            <div class="d-flex align-center ga-2 mb-1">
              <v-icon icon="mdi-database-off-outline" color="error" size="18" />
              <span class="font-weight-bold">{{ connLabel }} is not connected</span>
            </div>
            <div class="text-body-2 text-medium-emphasis mb-2">{{ statusError }}</div>
            <v-btn size="small" variant="tonal" class="text-none" prepend-icon="mdi-refresh" @click="connect">
              Try again
            </v-btn>
          </div>

          <div class="d-flex align-center ga-2 mb-2">
            <v-icon :icon="isMssql ? 'mdi-microsoft' : 'mdi-elephant'" color="primary" />
            <div class="min-w-0">
              <div class="font-weight-bold text-truncate">
                {{ status?.server ?? (statusError ? '—' : 'Connecting…') }}
              </div>
              <div class="text-caption text-medium-emphasis text-truncate">
                {{ connLabel }}{{ status?.login ? ` · ${status.login}` : '' }}
              </div>
            </div>
          </div>
          <v-autocomplete
            v-model="db"
            :items="databases"
            item-title="name"
            item-value="name"
            density="compact"
            variant="outlined"
            hide-details
            prepend-inner-icon="mdi-database-outline"
            placeholder="Database"
            :loading="!status && !statusError"
          >
            <template #item="{ props, item }">
              <v-list-item v-bind="props" :subtitle="item.raw.system ? 'System' : undefined" />
            </template>
          </v-autocomplete>
          <v-text-field
            v-model="search"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            prepend-inner-icon="mdi-magnify"
            placeholder="Find a table…"
            class="mt-2"
          />
        </div>
        <v-progress-linear v-if="objectsLoading" indeterminate color="primary" height="2" />
        <div v-if="objectsError" class="text-error text-body-2 pa-3">{{ objectsError }}</div>

        <div class="tree">
          <template v-for="g in grouped" :key="g.kind">
            <button class="tree-group" @click="toggleGroup(g.kind)">
              <v-icon :icon="openGroups.includes(g.kind) ? 'mdi-chevron-down' : 'mdi-chevron-right'" size="18" />
              <span>{{ g.label }}</span>
              <span class="count">{{ g.items.length }}</span>
            </button>
            <template v-if="openGroups.includes(g.kind)">
              <div v-for="o in g.items" :key="key(o)">
                <div class="tree-item" :title="fullName(o)">
                  <button
                    class="tree-toggle"
                    :class="{ invisible: g.kind !== 'table' && g.kind !== 'view' }"
                    @click="toggleColumns(o)"
                  >
                    <v-icon :icon="expanded[key(o)] ? 'mdi-chevron-down' : 'mdi-chevron-right'" size="16" />
                  </button>
                  <v-icon :icon="g.icon" size="16" class="text-medium-emphasis" />
                  <span
                    class="tree-name"
                    @dblclick="g.kind === 'table' || g.kind === 'view' ? selectTop(o) : setEditor(scriptFor(o))"
                  >
                    <span class="text-medium-emphasis">{{ o.schema }}.</span>{{ o.name }}
                  </span>
                  <span v-if="o.rows !== null" class="rows">{{ fmt(o.rows) }}</span>
                  <v-menu location="end">
                    <template #activator="{ props }">
                      <button v-bind="props" class="tree-more"><v-icon icon="mdi-dots-horizontal" size="16" /></button>
                    </template>
                    <v-list density="compact">
                      <v-list-item
                        v-if="g.kind === 'table' || g.kind === 'view'"
                        prepend-icon="mdi-play"
                        title="Select top 1000 rows"
                        @click="selectTop(o)"
                      />
                      <v-list-item prepend-icon="mdi-code-tags" title="Script" @click="setEditor(scriptFor(o))" />
                      <v-list-item
                        prepend-icon="mdi-text-box-plus-outline"
                        title="Insert name"
                        @click="insertAtCursor(fullName(o))"
                      />
                    </v-list>
                  </v-menu>
                </div>
                <template v-if="expanded[key(o)]">
                  <div v-if="expanded[key(o)] === 'loading'" class="tree-col text-medium-emphasis">Loading…</div>
                  <div
                    v-for="c in expanded[key(o)] as Column[]"
                    v-else
                    :key="c.name"
                    class="tree-col"
                    :title="`Double-click to insert ${c.name}`"
                    @dblclick="insertAtCursor(q(c.name))"
                  >
                    <v-icon
                      :icon="c.isKey ? 'mdi-key-variant' : 'mdi-table-column'"
                      size="14"
                      :color="c.isKey ? 'warning' : undefined"
                    />
                    <span class="text-truncate">{{ c.name }}</span>
                    <span class="col-type">{{ c.type }}{{ c.nullable ? '' : ', not null' }}</span>
                  </div>
                </template>
              </div>
              <div v-if="!g.items.length && !objectsLoading" class="tree-col text-medium-emphasis">None</div>
            </template>
          </template>
        </div>
      </v-card>

      <!-- editor + results -->
      <div class="work">
        <v-card class="bordered editor-card">
          <div class="toolbar">
            <v-btn
              color="success"
              variant="flat"
              size="small"
              class="text-none"
              prepend-icon="mdi-play"
              :loading="running"
              :disabled="!db"
              @click="run"
            >
              Execute
            </v-btn>
            <span class="text-caption text-medium-emphasis d-none d-sm-inline">
              F5 or ⌘/Ctrl + Enter · select text to run only that part
            </span>
            <v-spacer />
            <v-chip size="small" variant="tonal" :prepend-icon="isMssql ? 'mdi-microsoft' : 'mdi-elephant'">
              {{ connLabel }} · {{ db || '—' }}
            </v-chip>
            <v-btn size="small" variant="text" icon="mdi-file-outline" title="New query" @click="setEditor('')" />
          </div>
          <div class="editor-wrap">
            <div class="gutter text-mono" aria-hidden="true">
              <div v-for="n in lineCount" :key="n">{{ n }}</div>
            </div>
            <textarea
              ref="editor"
              v-model="sqlText"
              class="editor text-mono"
              spellcheck="false"
              autocomplete="off"
              autocapitalize="off"
              placeholder="Type SQL here…"
              @keydown="onEditorKey"
              @scroll="
                ($event.target as HTMLElement).previousElementSibling!.scrollTop = (
                  $event.target as HTMLElement
                ).scrollTop
              "
            />
          </div>
        </v-card>

        <v-card class="bordered results-card">
          <v-progress-linear v-if="running" indeterminate color="primary" height="2" />
          <v-alert v-if="runError" type="error" variant="tonal" density="compact" class="ma-3" :text="runError" />

          <template v-if="result">
            <div class="results-head">
              <v-tabs v-model="tab" density="compact" color="primary" show-arrows class="flex-grow-1">
                <v-tab v-for="(rs, i) in result.resultSets" :key="i" :value="i" class="text-none">
                  Results {{ result.resultSets.length > 1 ? i + 1 : '' }}
                  <span class="tab-count">{{ fmt(rs.total) }}</span>
                </v-tab>
                <v-tab value="messages" class="text-none">
                  <v-icon v-if="result.error" icon="mdi-alert-circle" color="error" size="16" class="mr-1" />
                  Messages
                </v-tab>
              </v-tabs>
              <v-btn
                v-if="current"
                size="small"
                variant="text"
                class="text-none"
                prepend-icon="mdi-microsoft-excel"
                @click="exportCurrent"
              >
                Excel
              </v-btn>
            </div>

            <div v-if="current && current.truncated" class="truncated">
              Showing the first {{ fmt(current.rows.length) }} of {{ fmt(current.total) }} rows. Use TOP or WHERE to see
              others.
            </div>

            <div v-if="current" class="grid-wrap">
              <table class="grid">
                <thead>
                  <tr>
                    <th class="rownum" />
                    <th v-for="(c, i) in current.columns" :key="i" :title="c.type">
                      {{ c.name || '(No column name)' }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(r, ri) in current.rows" :key="ri">
                    <td class="rownum">{{ ri + 1 }}</td>
                    <td
                      v-for="(v, ci) in r"
                      :key="ci"
                      :class="{ null: v === null, num: isNumberCol(current.columns[ci]?.type ?? '') }"
                      :title="v === null ? 'NULL' : showCell(v, current.columns[ci]?.type)"
                      @dblclick="copyCell(v, current.columns[ci]?.type)"
                    >
                      {{ showCell(v, current.columns[ci]?.type) }}
                    </td>
                  </tr>
                  <tr v-if="!current.rows.length">
                    <td :colspan="current.columns.length + 1" class="text-medium-emphasis pa-4">No rows</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-else class="messages text-mono">
              <div v-if="result.error" class="text-error">
                Msg {{ result.error.number ?? '' }}{{ result.error.line ? `, Line ${result.error.line}` : '' }}<br />
                {{ result.error.message }}
              </div>
              <div v-for="(m, i) in result.messages" :key="i">{{ m }}</div>
              <div v-if="!result.error && !result.messages.length">Commands completed successfully.</div>
            </div>

            <div class="statusbar">
              <v-icon
                :icon="result.error ? 'mdi-alert-circle' : 'mdi-check-circle'"
                :color="result.error ? 'error' : 'success'"
                size="16"
              />
              {{ result.error ? 'Query finished with errors' : 'Query executed successfully' }}
              <v-spacer />
              <span>{{ db }}</span>
              <span>{{ (result.durationMs / 1000).toFixed(2) }} s</span>
              <span v-if="current">{{ fmt(current.total) }} rows</span>
            </div>
          </template>

          <div v-else-if="!running && !runError" class="empty text-medium-emphasis">
            <v-icon icon="mdi-table-search" size="40" class="mb-2" />
            <div>Run a query to see results here.</div>
            <div class="text-caption">Double-click a table on the left to see its first 1000 rows.</div>
          </div>
        </v-card>
      </div>
    </div>

    <!-- risky statement confirm -->
    <v-dialog v-model="confirm.open" max-width="520">
      <v-card class="pa-2">
        <v-card-title class="d-flex align-center ga-2">
          <v-icon icon="mdi-alert" color="error" />
          Run this on {{ db }}?
        </v-card-title>
        <v-card-text>
          <p class="mb-3">{{ confirm.reason }}</p>
          <pre class="confirm-sql text-mono">{{ confirm.text }}</pre>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" class="text-none" @click="confirm.open = false">Cancel</v-btn>
          <v-btn color="error" variant="flat" class="text-none" @click="execute(confirm.text)">Run it</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="copied" timeout="1200" location="bottom">Copied</v-snackbar>
  </div>
</template>

<style scoped>
/* Fills the screen under the top bar; each panel scrolls inside itself. */
.sql-page {
  height: calc(100dvh - 68px - 48px);
  min-height: 520px;
}
.sql-grid {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 16px;
  height: 100%;
}
@media (max-width: 960px) {
  .sql-page {
    height: auto;
  }
  .sql-grid {
    grid-template-columns: 1fr;
  }
  .explorer {
    max-height: 360px;
  }
}
.min-w-0 {
  min-width: 0;
}

/* ── explorer ── */
.conn-error {
  padding: 10px 12px;
  margin-bottom: 10px;
  border-radius: 10px;
  background: rgba(217, 68, 58, 0.08);
}
.explorer {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.tree {
  flex: 1;
  overflow: auto;
  padding: 4px 6px 10px;
  font-size: 0.85rem;
}
.tree button {
  background: none;
  border: 0;
  color: inherit;
  cursor: pointer;
}
.tree-group {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 6px 4px;
  font-weight: 700;
  border-radius: 6px;
}
.tree-group:hover,
.tree-item:hover,
.tree-col:hover {
  background: rgba(var(--v-theme-on-surface), 0.05);
}
.count,
.rows {
  margin-left: auto;
  font-size: 0.72rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.tree-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 4px 3px 10px;
  border-radius: 6px;
}
.tree-toggle,
.tree-more {
  display: grid;
  place-items: center;
  padding: 0;
  width: 18px;
}
.tree-toggle.invisible {
  visibility: hidden;
}
.tree-more {
  opacity: 0;
}
.tree-item:hover .tree-more {
  opacity: 1;
}
.tree-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: default;
  user-select: none;
}
.tree-col {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px 2px 54px;
  font-size: 0.8rem;
  border-radius: 6px;
  cursor: default;
}
.col-type {
  margin-left: auto;
  font-size: 0.7rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
  white-space: nowrap;
}

/* ── editor ── */
.work {
  display: grid;
  grid-template-rows: minmax(160px, 38%) minmax(0, 1fr);
  gap: 16px;
  min-height: 0;
}
.editor-card,
.results-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
.editor-wrap {
  flex: 1;
  display: flex;
  min-height: 0;
}
.gutter {
  padding: 10px 8px;
  text-align: right;
  font-size: 0.85rem;
  line-height: 1.5;
  color: rgba(var(--v-theme-on-surface), 0.35);
  background: rgba(var(--v-theme-on-surface), 0.03);
  overflow: hidden;
  user-select: none;
  min-width: 42px;
}
.editor {
  flex: 1;
  resize: none;
  border: 0;
  outline: none;
  padding: 10px 12px;
  font-size: 0.85rem;
  line-height: 1.5;
  color: inherit;
  background: transparent;
  white-space: pre;
  overflow: auto;
  tab-size: 4;
}

/* ── results ── */
.results-head {
  display: flex;
  align-items: center;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  padding-right: 8px;
}
.tab-count {
  margin-left: 6px;
  font-size: 0.72rem;
  padding: 0 6px;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.08);
}
.truncated {
  padding: 6px 12px;
  font-size: 0.8rem;
  background: rgba(237, 161, 0, 0.12);
}
.grid-wrap {
  flex: 1;
  overflow: auto;
  min-height: 0;
}
.grid {
  border-collapse: separate;
  border-spacing: 0;
  font-size: 0.8rem;
  font-family: Menlo, Consolas, monospace;
}
.grid th,
.grid td {
  padding: 4px 10px;
  border-right: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  white-space: nowrap;
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
}
.grid th {
  position: sticky;
  top: 0;
  z-index: 1;
  font-weight: 700;
  background: rgb(var(--v-theme-surface));
  box-shadow: inset 0 -2px 0 rgba(var(--v-theme-on-surface), 0.12);
}
.grid tbody tr:hover td {
  background: rgba(252, 208, 33, 0.1);
}
.grid .rownum {
  position: sticky;
  left: 0;
  text-align: right;
  color: rgba(var(--v-theme-on-surface), 0.45);
  background: rgb(var(--v-theme-surface));
  min-width: 44px;
}
.grid th.rownum {
  z-index: 2;
}
.grid td.null {
  font-style: italic;
  color: rgba(var(--v-theme-on-surface), 0.4);
  background: rgba(252, 208, 33, 0.06);
}
.grid td.num {
  text-align: right;
}
.messages {
  flex: 1;
  overflow: auto;
  padding: 12px 14px;
  font-size: 0.85rem;
  white-space: pre-wrap;
}
.statusbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 12px;
  font-size: 0.75rem;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgba(var(--v-theme-on-surface), 0.03);
}
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px;
}
.confirm-sql {
  max-height: 200px;
  overflow: auto;
  padding: 10px;
  border-radius: 8px;
  font-size: 0.8rem;
  white-space: pre-wrap;
  background: rgba(var(--v-theme-on-surface), 0.05);
}
</style>
