<script setup lang="ts">
/**
 * SQL console (administrators only), laid out like SQL Server Management Studio:
 * Object Explorer on the left, a query window (toolbar, colored editor) and the
 * results grid / messages below it, with a status bar.
 * It works on the database the API runs on: PostgreSQL (dev) or SQL Server (prod).
 */
import { useTheme } from 'vuetify'

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
const theme = useTheme()
const dark = computed(() => theme.global.current.value.dark)

// Per-browser conveniences only (editor text, layout): may be unavailable.
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

// ── connection: the database this API runs on ──
const conn = ref<ConnId>('postgres')
const isMssql = computed(() => conn.value === 'mssql')
const connLabel = computed(() => (isMssql.value ? 'SQL Server' : 'PostgreSQL'))
const status = ref<Status | null>(null)
const statusError = ref('')
const databases = ref<{ name: string; system: boolean }[]>([])
const db = ref('')
/** "16.0.1000.6" from the long version text. */
const shortVersion = computed(() => status.value?.version?.match(/\d+\.\d+(\.\d+)*/)?.[0] ?? '')

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

// ── object explorer ──
const objects = ref<DbObject[]>([])
const objectsLoading = ref(false)
const objectsError = ref('')
const search = ref('')
const open = ref<Record<string, boolean>>({ server: true, dbs: true, db: true, table: true })
const toggle = (k: string) => (open.value[k] = !open.value[k])
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

const filtered = computed(() => {
  const s = search.value?.trim().toLowerCase()
  return s ? objects.value.filter((o) => `${o.schema}.${o.name}`.toLowerCase().includes(s)) : objects.value
})
const byKind = (kind: DbObject['kind']) => filtered.value.filter((o) => o.kind === kind)
const FOLDERS = [
  { kind: 'table', label: 'Tables', icon: 'mdi-table' },
  { kind: 'view', label: 'Views', icon: 'mdi-table-eye' },
] as const
const PROGRAMMABILITY = [
  { kind: 'procedure', label: 'Stored Procedures', icon: 'mdi-script-text-outline' },
  { kind: 'function', label: 'Functions', icon: 'mdi-function-variant' },
] as const

/** Name quoted the way the current server wants: [x] for SQL Server, "x" for PostgreSQL. */
const q = (n: string) => (isMssql.value ? `[${n.replace(/]/g, ']]')}]` : `"${n.replace(/"/g, '""')}"`)
const fullName = (o: DbObject) => `${q(o.schema)}.${q(o.name)}`
const key = (o: DbObject) => `${o.schema}.${o.name}`
/** SSMS style: "id (PK, int, not null)". */
const columnLabel = (c: Column) => `${c.isKey ? 'PK, ' : ''}${c.type}, ${c.nullable ? 'null' : 'not null'}`

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
async function scriptSelect(o: DbObject) {
  let cols = expanded.value[key(o)]
  if (!Array.isArray(cols)) {
    try {
      cols = await api<Column[]>('/sql/columns', { query: { db: db.value, schema: o.schema, name: o.name } })
    } catch {
      cols = []
    }
  }
  const list = cols.length
    ? cols
        .map((c) => `       ${q(c.name)}`)
        .join(',\n')
        .trimStart()
    : '*'
  setEditor(
    isMssql.value
      ? `SELECT TOP (1000) ${list}\nFROM ${fullName(o)};`
      : `SELECT ${list}\nFROM ${fullName(o)}\nLIMIT 1000;`,
  )
}
function scriptFor(o: DbObject) {
  if (o.kind === 'procedure') return isMssql.value ? `EXEC ${fullName(o)};` : `CALL ${fullName(o)}();`
  if (o.kind === 'function') return `SELECT * FROM ${fullName(o)}();`
  return `SELECT COUNT(*) AS ${q('rows')} FROM ${fullName(o)};`
}

// ── menus: right-click or the ⋯ button (database / Object Explorer item / results grid) ──
type MenuType = 'database' | 'object' | 'grid'
const menu = ref<{ open: boolean; x: number; y: number; type: MenuType; obj: DbObject | null }>({
  open: false,
  x: 0,
  y: 0,
  type: 'object',
  obj: null,
})
function openMenu(e: MouseEvent, type: MenuType, obj: DbObject | null = null) {
  // The ⋯ button opens the menu under itself; right-click opens it at the mouse.
  const btn = e.type === 'click' ? (e.currentTarget as HTMLElement | null)?.getBoundingClientRect() : null
  menu.value = {
    open: true,
    x: btn ? btn.left : e.clientX,
    y: btn ? btn.bottom : e.clientY,
    type,
    obj,
  }
}

// ── back up (SQL Server: Tasks → Back Up…) ──
interface Backup {
  file: string
  startedAt?: string
  finishedAt: string
  sizeBytes?: number
  compressedBytes?: number
  type?: string
  copyOnly?: boolean
  byLogin?: string
}
const backup = ref({ open: false, running: false, error: '', done: null as Backup | null })
const backups = ref<Backup[]>([])
const backupsLoading = ref(false)

async function openBackup() {
  backup.value = { open: true, running: false, error: '', done: null }
  await loadBackups()
}
async function loadBackups() {
  if (!isMssql.value) return
  backupsLoading.value = true
  try {
    backups.value = await api<Backup[]>('/sql/backups', { query: { db: db.value } })
  } catch {
    backups.value = []
  } finally {
    backupsLoading.value = false
  }
}
async function runBackup() {
  backup.value.running = true
  backup.value.error = ''
  backup.value.done = null
  try {
    backup.value.done = await api<Backup>('/sql/backup', { method: 'POST', body: { db: db.value } })
    await loadBackups()
  } catch (e) {
    backup.value.error = errorMessage(e, 'The backup failed.')
  } finally {
    backup.value.running = false
  }
}
const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path
/** msdb times are the SQL Server machine's clock: show them as stored. */
const serverTime = (t?: string) => (t ? t.replace('T', ' ').replace(/(\.\d+)?Z$/, '') : '—')
function size(bytes?: number) {
  if (!bytes) return '—'
  const mb = bytes / 1024 / 1024
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}
const menuObj = computed(() => menu.value.obj)
const menuIsData = computed(() => menuObj.value?.kind === 'table' || menuObj.value?.kind === 'view')

// ── editor ──
const editor = ref<HTMLTextAreaElement | null>(null)
const highlightEl = ref<HTMLElement | null>(null)
const gutterEl = ref<HTMLElement | null>(null)
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
  if (((e.metaKey || e.ctrlKey) && e.key === 'Enter') || e.key === 'F5') {
    e.preventDefault()
    run()
  } else if (e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault()
    insertAtCursor('    ')
  }
}
function syncScroll() {
  const el = editor.value
  if (!el) return
  if (highlightEl.value) {
    highlightEl.value.scrollTop = el.scrollTop
    highlightEl.value.scrollLeft = el.scrollLeft
  }
  if (gutterEl.value) gutterEl.value.scrollTop = el.scrollTop
}
const lineCount = computed(() => sqlText.value.split('\n').length)

// SSMS-like coloring: keywords blue, functions pink, strings red, comments green, system objects green.
const KEYWORDS = new Set(
  `ADD ALL ALTER AND ANY APPLY AS ASC BEGIN BETWEEN BY CASCADE CASE CHECK COLUMN COMMIT CONSTRAINT CREATE CROSS
  CURSOR DATABASE DEALLOCATE DECLARE DEFAULT DELETE DESC DISTINCT DROP ELSE END EXCEPT EXEC EXECUTE EXISTS FETCH
  FOR FOREIGN FROM FULL FUNCTION GO GRANT GROUP HAVING IDENTITY IF IN INDEX INNER INSERT INTERSECT INTO IS JOIN KEY
  LEFT LIKE LIMIT MERGE NEXT NOCOUNT NOLOCK NOT NULL OF OFF OFFSET ON ONLY OR ORDER OUTER OVER PARTITION PERCENT
  PRIMARY PRINT PROC PROCEDURE REFERENCES RETURN RETURNS RETURNING RIGHT ROLLBACK ROW ROWS SCHEMA SELECT SET TABLE
  THEN TIES TOP TRAN TRANSACTION TRIGGER TRUNCATE UNION UNIQUE UPDATE USE USING VALUES VIEW WHEN WHERE WHILE WITH`.split(
    /\s+/,
  ),
)
const FUNCTIONS = new Set(
  `ABS AVG CAST CEILING CHARINDEX COALESCE CONCAT CONVERT COUNT COUNT_BIG DATEADD DATEDIFF DATENAME DATEPART
  DATE_TRUNC DAY DENSE_RANK FLOOR FORMAT GETDATE GETUTCDATE ISJSON ISNULL JSON_QUERY JSON_VALUE LAG LEAD LEFT LEN
  LENGTH LOWER LTRIM MAX MIN MONTH NEWID NOW NTILE NULLIF OPENJSON RANK REPLACE RIGHT ROUND ROW_NUMBER RTRIM
  STRING_AGG SUBSTRING SUM SYSDATETIME SYSDATETIMEOFFSET TO_CHAR TRIM TRY_CAST TRY_CONVERT UPPER YEAR`.split(/\s+/),
)
const SYSTEM = new Set(['SYS', 'INFORMATION_SCHEMA', 'PG_CATALOG'])
const TOKEN =
  /(--[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|(N?'(?:[^']|'')*'?)|(\[[^\]\n]*\]?|"[^"\n]*"?)|(@@?\w+)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][\w$#]*)|([-+*/%=<>!(),;.]+)/g
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function highlight(sql: string) {
  let html = ''
  let last = 0
  for (const m of sql.matchAll(TOKEN)) {
    const i = m.index ?? 0
    html += escapeHtml(sql.slice(last, i))
    last = i + m[0].length
    const t = escapeHtml(m[0])
    let cls = ''
    if (m[1]) cls = 'tk-comment'
    else if (m[2]) cls = 'tk-string'
    else if (m[4]) cls = m[4].startsWith('@@') ? 'tk-func' : 'tk-var'
    else if (m[7]) cls = 'tk-op'
    else if (m[6]) {
      const w = m[6].toUpperCase()
      const call = /^\s*\(/.test(sql.slice(last, last + 40))
      if (FUNCTIONS.has(w) && (call || !KEYWORDS.has(w))) cls = 'tk-func'
      else if (KEYWORDS.has(w)) cls = 'tk-keyword'
      else if (SYSTEM.has(w)) cls = 'tk-system'
    }
    html += cls ? `<span class="${cls}">${t}</span>` : t
  }
  // The trailing newline keeps the last line's height equal to the textarea's.
  return html + escapeHtml(sql.slice(last)) + '\n'
}
const highlighted = computed(() => highlight(sqlText.value))

// ── query window / results split (drag the bar between them) ──
const docEl = ref<HTMLElement | null>(null)
const editorPct = ref(Number(load('sql_split')) || 40)
function startResize(e: PointerEvent) {
  const box = docEl.value?.getBoundingClientRect()
  if (!box) return
  const move = (ev: PointerEvent) => {
    editorPct.value = Math.min(80, Math.max(15, ((ev.clientY - box.top) / box.height) * 100))
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    save('sql_split', String(Math.round(editorPct.value)))
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  e.preventDefault()
}

// ── running ──
const running = ref(false)
const result = ref<QueryResult | null>(null)
const runError = ref('')
const tab = ref<number | 'messages'>(0)
const resultConn = ref<ConnId>('postgres')
const completedAt = ref<Date | null>(null)

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
  resultConn.value = conn.value
  try {
    const r = await api<QueryResult>('/sql/query', {
      method: 'POST',
      body: { db: db.value, sql: text },
    })
    result.value = r
    completedAt.value = new Date()
    tab.value = r.error || !r.resultSets.length ? 'messages' : 0
  } catch (e) {
    result.value = null
    runError.value = errorMessage(e, 'The query could not be sent.')
  } finally {
    running.value = false
  }
}

const current = computed(() => (typeof tab.value === 'number' ? (result.value?.resultSets[tab.value] ?? null) : null))
const totalRows = computed(() => result.value?.resultSets.reduce((n, rs) => n + rs.total, 0) ?? 0)
/** 00:00:01 like SSMS (the exact time is in the tooltip). */
const elapsed = computed(() => {
  const s = Math.floor((result.value?.durationMs ?? 0) / 1000)
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':')
})

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

// ── grid selection & copy (click a cell, arrows move, ⌘/Ctrl+C copies) ──
const sel = ref<{ r: number; c: number } | null>(null)
watch([result, tab], () => (sel.value = null))
const gridEl = ref<HTMLElement | null>(null)

function selectCell(r: number, c: number) {
  sel.value = { r, c }
  gridEl.value?.focus({ preventScroll: true })
}
const cellText = (rs: ResultSet, r: number, c: number) => showCell(rs.rows[r]?.[c] ?? null, rs.columns[c]?.type)
const tsvRow = (rs: ResultSet, r: number) => rs.columns.map((_c, c) => cellText(rs, r, c)).join('\t')
const tsvHeader = (rs: ResultSet) => rs.columns.map((c) => c.name).join('\t')

const copied = ref('')
async function copyText(text: string, what = 'Copied') {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = what
  } catch {
    // clipboard blocked
  }
}
function copyCell() {
  const rs = current.value
  if (rs && sel.value) copyText(cellText(rs, sel.value.r, sel.value.c))
}
function copyRow(withHeader: boolean) {
  const rs = current.value
  if (!rs || !sel.value) return
  copyText((withHeader ? tsvHeader(rs) + '\n' : '') + tsvRow(rs, sel.value.r), 'Row copied')
}
function copyAll(withHeader: boolean) {
  const rs = current.value
  if (!rs) return
  const body = rs.rows.map((_r, r) => tsvRow(rs, r)).join('\n')
  copyText((withHeader ? tsvHeader(rs) + '\n' : '') + body, `${fmt(rs.rows.length)} rows copied`)
}
function onGridKey(e: KeyboardEvent) {
  const rs = current.value
  if (!rs || !sel.value) return
  const { r, c } = sel.value
  const moves: Record<string, [number, number]> = {
    ArrowUp: [r - 1, c],
    ArrowDown: [r + 1, c],
    ArrowLeft: [r, c - 1],
    ArrowRight: [r, c + 1],
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
    e.preventDefault()
    copyCell()
  } else if (moves[e.key]) {
    e.preventDefault()
    const [nr, nc] = moves[e.key]!
    if (nr >= 0 && nr < rs.rows.length && nc >= 0 && nc < rs.columns.length) {
      sel.value = { r: nr, c: nc }
      nextTick(() =>
        gridEl.value?.querySelector('td.selected')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
      )
    }
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
  <div class="sql-page" :class="{ dark }">
    <div class="sql-grid">
      <!-- ═════ Object Explorer ═════ -->
      <section class="pane explorer">
        <header class="pane-title">
          <span>Object Explorer</span>
          <v-spacer />
          <button class="icon-btn" title="Refresh" @click="connect">
            <v-icon icon="mdi-refresh" size="16" />
          </button>
        </header>

        <div class="px-2 pt-2">
          <div v-if="statusError" class="conn-error">
            <div class="d-flex align-center ga-2 mb-1">
              <v-icon icon="mdi-database-off-outline" color="error" size="16" />
              <span class="font-weight-bold">{{ connLabel }} is not connected</span>
            </div>
            <div class="mb-2">{{ statusError }}</div>
            <v-btn size="x-small" variant="tonal" class="text-none" prepend-icon="mdi-refresh" @click="connect">
              Try again
            </v-btn>
          </div>
          <input v-model="search" class="filter" type="search" placeholder="Filter tables…" />
        </div>
        <v-progress-linear
          v-if="objectsLoading || (!status && !statusError)"
          indeterminate
          color="primary"
          height="2"
        />

        <div class="tree" role="tree">
          <!-- server -->
          <div class="node lvl0" @click="toggle('server')">
            <v-icon :icon="open.server ? 'mdi-chevron-down' : 'mdi-chevron-right'" size="14" class="chev" />
            <v-icon icon="mdi-server" size="16" class="ico-server" />
            <span class="label">
              <b>{{ status?.server ?? (statusError ? '—' : 'Connecting…') }}</b>
              <span v-if="status" class="dim">
                ({{ connLabel }}{{ shortVersion ? ` ${shortVersion}` : '' }} - {{ status.login }})
              </span>
            </span>
          </div>

          <template v-if="open.server && status">
            <div class="node lvl1" @click="toggle('dbs')">
              <v-icon :icon="open.dbs ? 'mdi-chevron-down' : 'mdi-chevron-right'" size="14" class="chev" />
              <v-icon :icon="open.dbs ? 'mdi-folder-open' : 'mdi-folder'" size="16" class="ico-folder" />
              <span class="label">Databases</span>
            </div>

            <template v-if="open.dbs">
              <template v-for="d in databases" :key="d.name">
                <div
                  class="node lvl2"
                  :class="{ active: d.name === db }"
                  @click="db === d.name ? toggle('db') : (db = d.name)"
                  @contextmenu.prevent="openMenu($event, 'database')"
                >
                  <v-icon
                    :icon="open.db && d.name === db ? 'mdi-chevron-down' : 'mdi-chevron-right'"
                    size="14"
                    class="chev"
                  />
                  <v-icon icon="mdi-database" size="16" class="ico-db" />
                  <span class="label">{{ d.name }}</span>
                  <button class="more" title="More…" @click.stop="openMenu($event, 'database')">
                    <v-icon icon="mdi-dots-horizontal" size="16" />
                  </button>
                </div>

                <template v-if="open.db && d.name === db">
                  <div v-if="objectsError" class="node lvl3 text-error">{{ objectsError }}</div>

                  <!-- Tables / Views -->
                  <template v-for="f in FOLDERS" :key="f.kind">
                    <div class="node lvl3" @click="toggle(f.kind)">
                      <v-icon :icon="open[f.kind] ? 'mdi-chevron-down' : 'mdi-chevron-right'" size="14" class="chev" />
                      <v-icon :icon="open[f.kind] ? 'mdi-folder-open' : 'mdi-folder'" size="16" class="ico-folder" />
                      <span class="label">{{ f.label }}</span>
                      <span class="count">{{ byKind(f.kind).length }}</span>
                    </div>
                    <template v-if="open[f.kind]">
                      <template v-for="o in byKind(f.kind)" :key="key(o)">
                        <div
                          class="node lvl4 obj"
                          :title="`${fullName(o)} — double-click: Select Top 1000 Rows · right-click: more`"
                          @click="toggleColumns(o)"
                          @dblclick.stop="selectTop(o)"
                          @contextmenu.prevent="openMenu($event, 'object', o)"
                        >
                          <v-icon
                            :icon="expanded[key(o)] ? 'mdi-chevron-down' : 'mdi-chevron-right'"
                            size="14"
                            class="chev"
                          />
                          <v-icon :icon="f.icon" size="16" class="ico-table" />
                          <span class="label"
                            ><span class="dim">{{ o.schema }}.</span>{{ o.name }}</span
                          >
                          <span v-if="o.rows !== null" class="count" :title="`${fmt(o.rows)} rows`">{{
                            fmt(o.rows)
                          }}</span>
                          <button class="more" title="More…" @click.stop="openMenu($event, 'object', o)">
                            <v-icon icon="mdi-dots-horizontal" size="16" />
                          </button>
                        </div>
                        <template v-if="expanded[key(o)]">
                          <div class="node lvl5">
                            <v-icon icon="mdi-chevron-down" size="14" class="chev" />
                            <v-icon icon="mdi-folder-open" size="16" class="ico-folder" />
                            <span class="label">Columns</span>
                          </div>
                          <div v-if="expanded[key(o)] === 'loading'" class="node lvl6 dim">Loading…</div>
                          <div
                            v-for="c in expanded[key(o)] as Column[]"
                            v-else
                            :key="c.name"
                            class="node lvl6"
                            :title="`${c.name} (${columnLabel(c)}) — double-click to insert`"
                            @dblclick="insertAtCursor(q(c.name))"
                          >
                            <span class="chev" />
                            <v-icon
                              :icon="c.isKey ? 'mdi-key-variant' : 'mdi-table-column'"
                              size="14"
                              :class="c.isKey ? 'ico-key' : 'ico-col'"
                            />
                            <span class="label"
                              >{{ c.name }} <span class="dim">({{ columnLabel(c) }})</span></span
                            >
                          </div>
                        </template>
                      </template>
                      <div v-if="!byKind(f.kind).length && !objectsLoading" class="node lvl4 dim">
                        <span class="chev" />None
                      </div>
                    </template>
                  </template>

                  <!-- Programmability -->
                  <div class="node lvl3" @click="toggle('prog')">
                    <v-icon :icon="open.prog ? 'mdi-chevron-down' : 'mdi-chevron-right'" size="14" class="chev" />
                    <v-icon :icon="open.prog ? 'mdi-folder-open' : 'mdi-folder'" size="16" class="ico-folder" />
                    <span class="label">Programmability</span>
                  </div>
                  <template v-if="open.prog">
                    <template v-for="f in PROGRAMMABILITY" :key="f.kind">
                      <div class="node lvl4" @click="toggle(f.kind)">
                        <v-icon
                          :icon="open[f.kind] ? 'mdi-chevron-down' : 'mdi-chevron-right'"
                          size="14"
                          class="chev"
                        />
                        <v-icon :icon="open[f.kind] ? 'mdi-folder-open' : 'mdi-folder'" size="16" class="ico-folder" />
                        <span class="label">{{ f.label }}</span>
                        <span class="count">{{ byKind(f.kind).length }}</span>
                      </div>
                      <template v-if="open[f.kind]">
                        <div
                          v-for="o in byKind(f.kind)"
                          :key="key(o)"
                          class="node lvl5 obj"
                          :title="fullName(o)"
                          @dblclick="setEditor(scriptFor(o))"
                          @contextmenu.prevent="openMenu($event, 'object', o)"
                        >
                          <span class="chev" />
                          <v-icon :icon="f.icon" size="16" class="ico-table" />
                          <span class="label"
                            ><span class="dim">{{ o.schema }}.</span>{{ o.name }}</span
                          >
                          <button class="more" title="More…" @click.stop="openMenu($event, 'object', o)">
                            <v-icon icon="mdi-dots-horizontal" size="16" />
                          </button>
                        </div>
                        <div v-if="!byKind(f.kind).length && !objectsLoading" class="node lvl5 dim">
                          <span class="chev" />None
                        </div>
                      </template>
                    </template>
                  </template>
                </template>
              </template>
            </template>
          </template>
        </div>
      </section>

      <!-- ═════ Query window ═════ -->
      <section ref="docEl" class="pane doc">
        <!-- toolbar -->
        <div class="toolbar">
          <div class="db-pick" title="Available Databases">
            <v-icon icon="mdi-database" size="16" class="ico-db" />
            <select v-model="db" :disabled="!databases.length">
              <option v-for="d in databases" :key="d.name" :value="d.name">{{ d.name }}</option>
            </select>
          </div>
          <button class="tb-btn execute" :disabled="!db || running" title="Execute (F5)" @click="run">
            <v-icon icon="mdi-play" size="18" />
            <span>Execute</span>
          </button>
          <span class="tb-sep" />
          <button class="tb-btn" title="New Query" @click="setEditor('')">
            <v-icon icon="mdi-file-document-plus-outline" size="16" />
            <span class="d-none d-md-inline">New Query</span>
          </button>
          <button class="tb-btn" :disabled="!current" title="Save results to Excel" @click="exportCurrent">
            <v-icon icon="mdi-microsoft-excel" size="16" />
            <span class="d-none d-md-inline">Save Results As</span>
          </button>
          <span class="tb-sep" />
          <button
            class="tb-btn"
            :disabled="!db || !isMssql"
            :title="isMssql ? 'Back up the database (.bak)' : 'Back up is for SQL Server (production)'"
            @click="openBackup"
          >
            <v-icon icon="mdi-database-export-outline" size="16" />
            <span class="d-none d-md-inline">Back Up…</span>
          </button>
          <v-spacer />
          <span class="hint d-none d-lg-inline">F5 or ⌘/Ctrl+Enter · select text to run only that part</span>
        </div>

        <!-- document tab -->
        <div class="doc-tabs">
          <div class="doc-tab">
            <v-icon icon="mdi-file-code-outline" size="14" />
            SQLQuery1.sql - {{ status?.server ?? '…' }}.{{ db || '…' }} ({{ status?.login ?? '…' }})
          </div>
        </div>

        <!-- editor -->
        <div class="editor-wrap" :style="{ height: `${editorPct}%` }">
          <div ref="gutterEl" class="gutter" aria-hidden="true">
            <div v-for="n in lineCount" :key="n">{{ n }}</div>
          </div>
          <div class="code">
            <!-- eslint-disable-next-line vue/no-v-html -- escaped by highlight() -->
            <pre ref="highlightEl" class="code-layer highlight" aria-hidden="true" v-html="highlighted" />
            <textarea
              ref="editor"
              v-model="sqlText"
              class="code-layer input"
              spellcheck="false"
              autocomplete="off"
              autocapitalize="off"
              placeholder="Type SQL here…"
              @keydown="onEditorKey"
              @scroll="syncScroll"
            />
          </div>
        </div>

        <!-- splitter -->
        <div class="splitter" title="Drag to resize" @pointerdown="startResize" />

        <!-- results -->
        <div class="results">
          <v-progress-linear v-if="running" indeterminate color="primary" height="2" />
          <div v-if="runError" class="messages text-error">{{ runError }}</div>

          <template v-if="result">
            <div class="result-tabs">
              <button
                v-for="(rs, i) in result.resultSets"
                :key="i"
                class="rtab"
                :class="{ on: tab === i }"
                @click="tab = i"
              >
                <v-icon icon="mdi-table-large" size="14" />
                Results{{ result.resultSets.length > 1 ? ` ${i + 1}` : '' }}
                <span class="badge">{{ fmt(rs.total) }}</span>
              </button>
              <button class="rtab" :class="{ on: tab === 'messages' }" @click="tab = 'messages'">
                <v-icon
                  :icon="result.error ? 'mdi-alert-circle' : 'mdi-message-text-outline'"
                  size="14"
                  :color="result.error ? 'error' : undefined"
                />
                Messages
              </button>
            </div>

            <div v-if="current && current.truncated" class="truncated">
              Showing the first {{ fmt(current.rows.length) }} of {{ fmt(current.total) }} rows. Use TOP or WHERE to see
              others.
            </div>

            <div
              v-if="current"
              ref="gridEl"
              class="grid-wrap"
              tabindex="0"
              @keydown="onGridKey"
              @contextmenu.prevent="openMenu($event, 'grid')"
            >
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
                  <tr v-for="(r, ri) in current.rows" :key="ri" :class="{ 'row-sel': sel?.r === ri }">
                    <!-- Row number drawn by CSS (::before), so copying the grid copies only the data columns. -->
                    <td class="rownum" :data-n="ri + 1" @click="selectCell(ri, 0)" />
                    <td
                      v-for="(v, ci) in r"
                      :key="ci"
                      :class="{
                        null: v === null,
                        num: isNumberCol(current.columns[ci]?.type ?? ''),
                        selected: sel?.r === ri && sel?.c === ci,
                      }"
                      :title="v === null ? 'NULL' : showCell(v, current.columns[ci]?.type)"
                      @mousedown="selectCell(ri, ci)"
                      @contextmenu="selectCell(ri, ci)"
                      @dblclick="copyCell"
                    >
                      {{ showCell(v, current.columns[ci]?.type) }}
                    </td>
                  </tr>
                  <tr v-if="!current.rows.length">
                    <td :colspan="current.columns.length + 1" class="no-rows">No rows</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-else class="messages">
              <div v-if="result.error" class="text-error">
                Msg {{ result.error.number ?? '' }}{{ result.error.line ? `, Line ${result.error.line}` : '' }}<br />
                {{ result.error.message }}
              </div>
              <div v-for="(m, i) in result.messages" :key="i">{{ m }}</div>
              <div v-if="!result.error && !result.messages.length">Commands completed successfully.</div>
              <div v-if="completedAt" class="mt-3 dim">Completion time: {{ completedAt.toISOString() }}</div>
            </div>
          </template>

          <div v-else-if="!running && !runError" class="empty">
            <v-icon icon="mdi-table-search" size="36" class="mb-2" />
            <div>Run a query to see results here.</div>
            <div class="dim">Double-click a table in Object Explorer to see its first 1000 rows.</div>
          </div>
        </div>

        <!-- status bar -->
        <div class="statusbar" :class="{ error: result?.error, busy: running }">
          <template v-if="running"> <v-icon icon="mdi-timer-sand" size="14" /> Executing query… </template>
          <template v-else-if="result">
            <v-icon :icon="result.error ? 'mdi-alert-circle' : 'mdi-check-circle'" size="14" />
            {{ result.error ? 'Query completed with errors.' : 'Query executed successfully.' }}
          </template>
          <template v-else-if="status"> <v-icon icon="mdi-lan-connect" size="14" /> Connected. </template>
          <v-spacer />
          <span v-if="status" class="sb-cell">{{ status.server }}{{ shortVersion ? ` (${shortVersion})` : '' }}</span>
          <span v-if="status" class="sb-cell">{{ status.login }}</span>
          <span class="sb-cell">{{ db || '—' }}</span>
          <span class="sb-cell" :title="result ? `${result.durationMs} ms` : ''">{{
            result ? elapsed : '00:00:00'
          }}</span>
          <span class="sb-cell">{{ fmt(current ? current.total : totalRows) }} rows</span>
        </div>
      </section>
    </div>

    <!-- right-click menu -->
    <v-menu v-model="menu.open" :target="[menu.x, menu.y]" location="bottom start">
      <v-list density="compact" class="ctx">
        <template v-if="menu.type === 'database'">
          <v-list-subheader>{{ db }}</v-list-subheader>
          <v-list-item prepend-icon="mdi-file-document-plus-outline" title="New Query" @click="setEditor('')" />
          <v-list-item
            prepend-icon="mdi-database-export-outline"
            title="Back Up…"
            :subtitle="isMssql ? 'Full, copy-only .bak' : 'SQL Server only'"
            :disabled="!isMssql"
            @click="openBackup"
          />
          <v-divider />
          <v-list-item prepend-icon="mdi-refresh" title="Refresh" @click="loadObjects" />
        </template>
        <template v-else-if="menu.type === 'object' && menuObj">
          <v-list-item
            v-if="menuIsData"
            prepend-icon="mdi-play"
            title="Select Top 1000 Rows"
            @click="selectTop(menuObj)"
          />
          <v-list-item
            v-if="menuIsData"
            prepend-icon="mdi-code-tags"
            title="Script SELECT"
            @click="scriptSelect(menuObj)"
          />
          <v-list-item
            prepend-icon="mdi-script-text-outline"
            :title="menuIsData ? 'Script COUNT(*)' : 'Script EXEC'"
            @click="setEditor(scriptFor(menuObj))"
          />
          <v-list-item
            prepend-icon="mdi-text-box-plus-outline"
            title="Insert name"
            @click="insertAtCursor(fullName(menuObj))"
          />
          <v-divider />
          <v-list-item prepend-icon="mdi-refresh" title="Refresh" @click="loadObjects" />
        </template>
        <template v-else-if="menu.type === 'grid' && current">
          <v-list-item
            prepend-icon="mdi-content-copy"
            title="Copy"
            subtitle="⌘/Ctrl+C"
            :disabled="!sel"
            @click="copyCell"
          />
          <v-list-item prepend-icon="mdi-table-row" title="Copy row" :disabled="!sel" @click="copyRow(false)" />
          <v-list-item
            prepend-icon="mdi-table-row-plus-before"
            title="Copy row with headers"
            :disabled="!sel"
            @click="copyRow(true)"
          />
          <v-divider />
          <v-list-item prepend-icon="mdi-table" title="Copy all" @click="copyAll(false)" />
          <v-list-item prepend-icon="mdi-table-headers-eye" title="Copy all with headers" @click="copyAll(true)" />
          <v-divider />
          <v-list-item prepend-icon="mdi-microsoft-excel" title="Save Results As (Excel)" @click="exportCurrent" />
        </template>
      </v-list>
    </v-menu>

    <!-- back up database -->
    <v-dialog v-model="backup.open" max-width="760" scrollable>
      <v-card>
        <v-card-title class="d-flex align-center ga-2 pt-4">
          <v-icon icon="mdi-database-export-outline" color="primary" />
          Back Up Database — {{ db }}
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" size="small" @click="backup.open = false" />
        </v-card-title>
        <v-card-text>
          <div class="bk-grid">
            <span class="dim">Source</span>
            <span>{{ status?.server }} · {{ db }}</span>
            <span class="dim">Backup type</span>
            <span>Full · Copy-only (does not change the server's regular backups)</span>
            <span class="dim">Options</span>
            <span>Compression · Checksum</span>
            <span class="dim">Destination</span>
            <span>SQL Server's backup folder <b>on the SQL Server machine</b> ({{ status?.server }})</span>
          </div>

          <v-alert
            v-if="backup.done"
            type="success"
            variant="tonal"
            density="compact"
            class="mt-4"
            title="The backup of the database completed successfully."
          >
            <div class="mono-sm">{{ backup.done.file }}</div>
            <div v-if="backup.done.compressedBytes" class="mt-1">
              {{ size(backup.done.compressedBytes) }} (data {{ size(backup.done.sizeBytes) }})
            </div>
          </v-alert>
          <v-alert
            v-if="backup.error"
            type="error"
            variant="tonal"
            density="compact"
            class="mt-4"
            :text="backup.error"
          />

          <div class="d-flex align-center mt-5 mb-2">
            <b>Backup history</b>
            <v-spacer />
            <v-btn size="small" variant="text" icon="mdi-refresh" :loading="backupsLoading" @click="loadBackups" />
          </div>
          <div class="bk-table-wrap">
            <table class="bk-table">
              <thead>
                <tr>
                  <th>Finished</th>
                  <th>File</th>
                  <th>Type</th>
                  <th class="num">Size</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="b in backups" :key="b.file + b.finishedAt">
                  <td class="nowrap">{{ serverTime(b.finishedAt) }}</td>
                  <td :title="b.file" class="mono-sm">{{ fileName(b.file) }}</td>
                  <td class="nowrap">{{ b.type }}{{ b.copyOnly ? ' (copy-only)' : '' }}</td>
                  <td class="num nowrap">{{ size(b.compressedBytes || b.sizeBytes) }}</td>
                  <td>{{ b.byLogin }}</td>
                </tr>
                <tr v-if="!backups.length">
                  <td colspan="5" class="dim">{{ backupsLoading ? 'Loading…' : 'No backups yet.' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="dim mt-2 text-caption">
            To restore: in SSMS on the SQL Server machine, right-click Databases → Restore Database… → Device → choose
            the .bak file.
          </div>
        </v-card-text>
        <v-card-actions class="px-6 pb-4">
          <v-spacer />
          <v-btn variant="text" class="text-none" @click="backup.open = false">Close</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            class="text-none"
            prepend-icon="mdi-database-export-outline"
            :loading="backup.running"
            @click="runBackup"
          >
            Back Up Now
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- risky statement confirm -->
    <v-dialog v-model="confirm.open" max-width="520">
      <v-card class="pa-2">
        <v-card-title class="d-flex align-center ga-2">
          <v-icon icon="mdi-alert" color="error" />
          Run this on {{ db }}?
        </v-card-title>
        <v-card-text>
          <p class="mb-3">{{ confirm.reason }}</p>
          <pre class="confirm-sql">{{ confirm.text }}</pre>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" class="text-none" @click="confirm.open = false">Cancel</v-btn>
          <v-btn color="error" variant="flat" class="text-none" @click="execute(confirm.text)">Run it</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar :model-value="!!copied" timeout="1200" location="bottom" @update:model-value="copied = ''">
      {{ copied }}
    </v-snackbar>
  </div>
</template>

<style scoped>
/* ── SSMS-like colors (light / dark) ── */
.sql-page {
  --line: rgba(var(--v-theme-on-surface), 0.14);
  --line-soft: rgba(var(--v-theme-on-surface), 0.08);
  --chrome: rgba(var(--v-theme-on-surface), 0.04);
  --head: #eef0f3;
  --rowhead: #f3f4f6;
  --sel: #cce4ff;
  --sel-row: rgba(0, 120, 215, 0.06);
  --tk-keyword: #0000ff;
  --tk-func: #c400c4;
  --tk-string: #c00000;
  --tk-comment: #008000;
  --tk-system: #008000;
  --tk-op: #7a7a7a;
  --tk-var: #6f4e9c;
  --status: #fff3c4;
  --status-text: #5a4500;
  --mono: Consolas, Menlo, 'SF Mono', 'Courier New', monospace;
  height: calc(100dvh - 68px - 48px);
  min-height: 540px;
  font-size: 13px;
}
.sql-page.dark {
  --head: #2b2d31;
  --rowhead: #26282c;
  --sel: #264f78;
  --sel-row: rgba(38, 79, 120, 0.25);
  --tk-keyword: #569cd6;
  --tk-func: #d670d6;
  --tk-string: #e5866b;
  --tk-comment: #6a9955;
  --tk-system: #4ec9b0;
  --tk-op: #a0a0a0;
  --tk-var: #9cdcfe;
  --status: #3a3320;
  --status-text: #f3dc8a;
}
.sql-grid {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 12px;
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
    max-height: 380px;
  }
  .doc {
    height: 760px;
  }
}
.pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgb(var(--v-theme-surface));
}
.dim {
  color: rgba(var(--v-theme-on-surface), 0.55);
}
button {
  background: none;
  border: 0;
  color: inherit;
  cursor: pointer;
  font: inherit;
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}

/* ── Object Explorer ── */
.pane-title {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.02em;
  background: var(--chrome);
  border-bottom: 1px solid var(--line-soft);
}
.icon-btn {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
}
.icon-btn:hover {
  background: var(--line-soft);
}
.conn-error {
  padding: 8px 10px;
  margin-bottom: 8px;
  border-radius: 6px;
  background: rgba(217, 68, 58, 0.08);
}
.filter {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid var(--line);
  border-radius: 4px;
  outline: none;
  color: inherit;
  font: inherit;
  background: transparent;
}
.filter:focus {
  border-color: rgb(var(--v-theme-primary));
}
.tree {
  flex: 1;
  overflow: auto;
  padding: 6px 0 12px;
  white-space: nowrap;
  user-select: none;
}
.node {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding-right: 10px;
  cursor: default;
}
.node:hover {
  background: var(--sel-row);
}
.node.active > .label {
  font-weight: 700;
}
.lvl0 {
  padding-left: 6px;
}
.lvl1 {
  padding-left: 22px;
}
.lvl2 {
  padding-left: 38px;
}
.lvl3 {
  padding-left: 54px;
}
.lvl4 {
  padding-left: 70px;
}
.lvl5 {
  padding-left: 86px;
}
.lvl6 {
  padding-left: 102px;
}
.chev {
  flex: 0 0 14px;
  width: 14px;
  opacity: 0.7;
}
.label {
  overflow: hidden;
  text-overflow: ellipsis;
}
/* ⋯ button: shows when the row is hovered (always on touch screens) */
.more {
  display: grid;
  place-items: center;
  flex: 0 0 22px;
  height: 20px;
  margin-left: 4px;
  border-radius: 4px;
  opacity: 0;
}
.node .count + .more {
  margin-left: 4px;
}
.node .label + .more {
  margin-left: auto;
}
.node:hover .more,
.more:focus-visible {
  opacity: 1;
}
.more:hover {
  background: var(--line);
}
@media (hover: none) {
  .more {
    opacity: 0.6;
  }
}
/* backup dialog */
.bk-grid {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 6px 12px;
}
.bk-table-wrap {
  max-height: 260px;
  overflow: auto;
  border: 1px solid var(--line, rgba(0, 0, 0, 0.12));
  border-radius: 6px;
}
.bk-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.bk-table th,
.bk-table td {
  padding: 5px 8px;
  text-align: left;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
.bk-table th {
  position: sticky;
  top: 0;
  background: rgb(var(--v-theme-surface));
}
.bk-table .num {
  text-align: right;
}
.nowrap {
  white-space: nowrap;
}
.mono-sm {
  font-family: Consolas, Menlo, monospace;
  font-size: 12px;
  word-break: break-all;
}
.count {
  margin-left: auto;
  padding-left: 8px;
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.ico-server {
  color: #5c6bc0;
}
.ico-folder {
  color: #e0a800;
}
.ico-db {
  color: #c1882a;
}
.ico-table {
  color: #4a7fb5;
}
.ico-col {
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.ico-key {
  color: #d4a000;
}

/* ── query window ── */
.toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  background: var(--chrome);
  border-bottom: 1px solid var(--line-soft);
}
.db-pick {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 4px 0 8px;
  height: 28px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: rgb(var(--v-theme-surface));
}
.db-pick select {
  min-width: 170px;
  height: 100%;
  border: 0;
  outline: none;
  color: inherit;
  font: inherit;
  background: transparent;
  cursor: pointer;
}
.db-pick option {
  color: #000;
}
.tb-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border-radius: 4px;
}
.tb-btn:not(:disabled):hover {
  background: var(--line-soft);
}
.tb-btn.execute {
  font-weight: 700;
  color: #1e8e3e;
}
.dark .tb-btn.execute {
  color: #5cd37c;
}
.tb-sep {
  width: 1px;
  height: 20px;
  margin: 0 4px;
  background: var(--line);
}
.hint {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.doc-tabs {
  display: flex;
  padding: 0 8px;
  background: var(--chrome);
  border-bottom: 1px solid var(--line);
}
.doc-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: -1px;
  padding: 5px 12px;
  font-size: 12px;
  border: 1px solid var(--line);
  border-bottom-color: rgb(var(--v-theme-surface));
  border-top: 2px solid rgb(var(--v-theme-primary));
  border-radius: 4px 4px 0 0;
  background: rgb(var(--v-theme-surface));
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* editor: a colored <pre> under a transparent <textarea> with the same metrics */
.editor-wrap {
  display: flex;
  min-height: 80px;
}
.gutter {
  flex: 0 0 auto;
  min-width: 44px;
  padding: 8px 8px 8px 4px;
  text-align: right;
  font-family: var(--mono);
  font-size: 13px;
  line-height: 20px;
  color: #2b91af;
  background: var(--chrome);
  border-right: 1px solid var(--line-soft);
  overflow: hidden;
  user-select: none;
}
.code {
  position: relative;
  flex: 1;
  min-width: 0;
}
.code-layer {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 8px 12px;
  border: 0;
  font-family: var(--mono);
  font-size: 13px;
  line-height: 20px;
  white-space: pre;
  tab-size: 4;
  overflow: auto;
}
.highlight {
  overflow: hidden;
  pointer-events: none;
  color: rgb(var(--v-theme-on-surface));
}
.input {
  resize: none;
  outline: none;
  color: transparent;
  background: transparent;
  caret-color: rgb(var(--v-theme-on-surface));
}
.input::selection {
  background: rgba(0, 120, 215, 0.3);
}
.input::placeholder {
  color: rgba(var(--v-theme-on-surface), 0.4);
}
.highlight :deep(.tk-keyword) {
  color: var(--tk-keyword);
}
.highlight :deep(.tk-func) {
  color: var(--tk-func);
}
.highlight :deep(.tk-string) {
  color: var(--tk-string);
}
.highlight :deep(.tk-comment) {
  color: var(--tk-comment);
}
.highlight :deep(.tk-system) {
  color: var(--tk-system);
}
.highlight :deep(.tk-op) {
  color: var(--tk-op);
}
.highlight :deep(.tk-var) {
  color: var(--tk-var);
}

.splitter {
  flex: 0 0 6px;
  cursor: row-resize;
  background: var(--chrome);
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  touch-action: none;
}
.splitter:hover {
  background: rgba(var(--v-theme-primary), 0.35);
}

/* ── results ── */
.results {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.result-tabs {
  display: flex;
  gap: 2px;
  padding: 4px 6px 0;
  background: var(--chrome);
  border-bottom: 1px solid var(--line);
}
.rtab {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: -1px;
  padding: 4px 12px;
  font-size: 12px;
  border: 1px solid transparent;
  border-radius: 4px 4px 0 0;
}
.rtab.on {
  font-weight: 700;
  border-color: var(--line);
  border-bottom-color: rgb(var(--v-theme-surface));
  background: rgb(var(--v-theme-surface));
}
.badge {
  padding: 0 6px;
  font-size: 10px;
  font-weight: 400;
  border-radius: 8px;
  background: var(--line-soft);
}
.truncated {
  padding: 5px 10px;
  font-size: 12px;
  background: rgba(237, 161, 0, 0.14);
}
.grid-wrap {
  flex: 1;
  overflow: auto;
  min-height: 0;
  outline: none;
}
.grid {
  border-collapse: separate;
  border-spacing: 0;
  font-family: var(--mono);
  font-size: 12.5px;
}
.grid th,
.grid td {
  height: 22px;
  padding: 0 8px;
  border-right: 1px solid var(--line-soft);
  border-bottom: 1px solid var(--line-soft);
  white-space: nowrap;
  max-width: 380px;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
}
.grid th {
  position: sticky;
  top: 0;
  z-index: 1;
  font-weight: 600;
  background: var(--head);
  border-right-color: var(--line);
  border-bottom: 1px solid var(--line);
}
.grid tbody td {
  cursor: cell;
}
.grid tbody tr.row-sel td {
  background: var(--sel-row);
}
.grid .rownum {
  position: sticky;
  left: 0;
  min-width: 44px;
  text-align: right;
  color: rgba(var(--v-theme-on-surface), 0.55);
  background: var(--rowhead);
  border-right: 1px solid var(--line);
  user-select: none;
  cursor: default;
}
.grid tbody tr.row-sel td.rownum {
  background: var(--sel);
}
.grid td.rownum::before {
  content: attr(data-n);
}
.grid th.rownum {
  z-index: 2;
  background: var(--head);
}
.grid td.null {
  font-style: italic;
  color: rgba(var(--v-theme-on-surface), 0.45);
  background: rgba(252, 208, 33, 0.08);
}
.grid tbody tr.row-sel td.null {
  background: var(--sel-row);
}
.grid td.num {
  text-align: right;
}
.grid td.selected,
.grid tbody tr.row-sel td.selected {
  background: var(--sel);
  outline: 1px dotted rgba(var(--v-theme-on-surface), 0.6);
  outline-offset: -2px;
}
.no-rows {
  padding: 12px !important;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.messages {
  flex: 1;
  overflow: auto;
  padding: 10px 14px;
  font-family: var(--mono);
  font-size: 13px;
  white-space: pre-wrap;
}
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.statusbar {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 0 0 10px;
  font-size: 12px;
  color: var(--status-text);
  background: var(--status);
  border-top: 1px solid var(--line);
  white-space: nowrap;
  overflow: hidden;
}
.statusbar.busy {
  color: #fff;
  background: #2f6fb3;
}
.statusbar.error {
  color: #fff;
  background: #b3412f;
}
.sb-cell {
  padding: 0 10px;
  border-left: 1px solid rgba(0, 0, 0, 0.12);
  overflow: hidden;
  text-overflow: ellipsis;
}
.ctx :deep(.v-list-item-title) {
  font-size: 13px;
}
.confirm-sql {
  max-height: 200px;
  overflow: auto;
  padding: 10px;
  border-radius: 8px;
  font-family: var(--mono);
  font-size: 12px;
  white-space: pre-wrap;
  background: rgba(var(--v-theme-on-surface), 0.05);
}
</style>
