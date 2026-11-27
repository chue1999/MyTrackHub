<script setup lang="ts">
/**
 * AI chat widget, on every page (mounted in the default layout, so it stays
 * open while you move between pages). Talks to Gemini / ChatGPT / Claude through
 * our API (official provider APIs); every conversation is saved per person.
 */
import DOMPurify from 'dompurify'
import { marked } from 'marked'

interface Provider {
  key: 'gemini' | 'chatgpt' | 'claude'
  name: string
  maker: string
  model: string
  images?: boolean
}
interface Conversation {
  id: number
  title: string | null
  provider: string | null
  updatedAt: string
}
interface FileInfo {
  id: number
  name: string
  mime: string
  kind: 'image' | 'pdf' | 'text'
  size: number
}
interface Pending {
  key: number
  name: string
  kind: 'image' | 'pdf' | 'text'
  status: 'uploading' | 'ready' | 'error'
  preview?: string
  error?: string
  file?: FileInfo
}
interface Msg {
  id?: number
  role: 'user' | 'assistant'
  content: string
  files?: FileInfo[]
  provider?: string | null
  model?: string | null
  error?: string | null
  streaming?: boolean
  status?: string
  createdAt?: string
}

const api = useApi()
const config = useRuntimeConfig()
const { token, admin } = useAuth()

const open = ref(false)
const wide = ref(false)
const showHistory = ref(false)
const providers = ref<Provider[]>([])
const provider = ref<Provider['key'] | null>(null)
const conversations = ref<Conversation[]>([])
const current = ref<number | null>(null)
const messages = ref<Msg[]>([])
const input = ref('')
const busy = ref(false)
const loaded = ref(false)
const initError = ref('')
let abort: AbortController | null = null

// Remember the panel state and the chosen AI across page reloads (this browser only).
const saved = (k: string) => {
  try {
    return localStorage.getItem(`ai-chat-${k}`)
  } catch {
    return null
  }
}
const save = (k: string, v: string) => {
  try {
    localStorage.setItem(`ai-chat-${k}`, v)
  } catch {
    /* storage blocked */
  }
}
onMounted(() => {
  open.value = saved('open') === '1'
  wide.value = saved('wide') === '1'
  if (open.value) init()
})
// The signed-in account loads after the page: start the chat once it is known.
watch(admin, () => open.value && init())
watch(open, (v) => {
  save('open', v ? '1' : '0')
  if (v) init()
})
watch(wide, (v) => save('wide', v ? '1' : '0'))
watch(provider, (v) => v && save('provider', v))

async function init() {
  if (loaded.value || !admin.value || admin.value.kind === 'ccare') return // no AI chat for CCare accounts
  loaded.value = true
  initError.value = ''
  try {
    providers.value = await api<Provider[]>('/ai/providers')
    const pref = saved('provider')
    provider.value = (providers.value.find((p) => p.key === pref) ?? providers.value[0])?.key ?? null
    if (!providers.value.length) return
    // History is a bonus: if it cannot load, asking still works.
    try {
      await loadHistory()
      const last = Number(saved('conversation'))
      if (last && conversations.value.some((c) => c.id === last)) await openConversation(last)
    } catch {
      conversations.value = []
    }
  } catch (e) {
    loaded.value = false
    const err = e as { status?: number; statusCode?: number; data?: { message?: string }; message?: string }
    const status = err.status ?? err.statusCode
    initError.value =
      status === 404
        ? 'The API on the server is an old version (no AI yet). Update it: git pull, npm install, then pm2 restart mytrackhub-api.'
        : (err.data?.message ?? err.message ?? 'Could not reach the AI service.')
  }
}
function retryInit() {
  loaded.value = false
  init()
}
async function loadHistory() {
  conversations.value = await api<Conversation[]>('/ai/conversations')
}
async function openConversation(id: number) {
  const r = await api<{ conversation: Conversation; messages: Msg[] }>(`/ai/conversations/${id}`)
  current.value = id
  messages.value = r.messages
  save('conversation', String(id))
  showHistory.value = wide.value
  scrollDown()
}
function newChat() {
  abort?.abort()
  current.value = null
  messages.value = []
  save('conversation', '')
  if (!wide.value) showHistory.value = false
  nextTick(() => inputEl.value?.focus())
}

// ── sending (streamed answer) ──
const listEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLTextAreaElement | null>(null)
function scrollDown() {
  nextTick(() => listEl.value?.scrollTo({ top: listEl.value.scrollHeight }))
}
// ── attachments: 📎 button, paste a picture, or drop files on the chat ──
const fileEl = ref<HTMLInputElement | null>(null)
const pending = ref<Pending[]>([])
const dragging = ref(false)
const uploading = computed(() => pending.value.some((p) => p.status === 'uploading'))
const readyFiles = computed(() => pending.value.filter((p) => p.status === 'ready' && p.file).map((p) => p.file!))
let fileKey = 0

async function addFiles(list: FileList | File[] | null | undefined) {
  for (const f of Array.from(list ?? [])) {
    if (pending.value.length >= 10) break
    const item = reactive<Pending>({
      key: ++fileKey,
      name: f.name || 'pasted-image.png',
      kind: aiFileKind(f.name, f.type),
      status: 'uploading',
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
    })
    pending.value.push(item)
    try {
      const prepared = await prepareAiFile(f)
      const res = await fetch(`${config.public.apiBase}/api/v1/admin/ai/files`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token.value}`,
          'content-type': 'application/octet-stream',
          'x-file-name': encodeURIComponent(prepared.name),
          'x-file-type': prepared.type || 'application/octet-stream',
        },
        body: prepared.body,
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.message || (res.status === 413 ? 'The file is too big (max 10 MB).' : `Error ${res.status}`))
      item.file = j as FileInfo
      item.name = item.file.name
      item.status = 'ready'
      if (item.preview) thumbs[item.file.id] = item.preview
    } catch (e) {
      item.status = 'error'
      item.error = (e as Error).message
    }
  }
}
function pickFiles() {
  fileEl.value?.click()
}
function onPicked(e: Event) {
  const el = e.target as HTMLInputElement
  addFiles(el.files)
  el.value = ''
}
function removePending(p: Pending) {
  pending.value = pending.value.filter((x) => x !== p)
  if (p.file) api(`/ai/files/${p.file.id}`, { method: 'DELETE' }).catch(() => {})
  else if (p.preview) URL.revokeObjectURL(p.preview)
}
function onPaste(e: ClipboardEvent) {
  const list = Array.from(e.clipboardData?.files ?? [])
  if (!list.length) return
  e.preventDefault()
  addFiles(list)
}
function onDrop(e: DragEvent) {
  dragging.value = false
  addFiles(e.dataTransfer?.files)
}
function onDragOver(e: DragEvent) {
  if (e.dataTransfer?.types.includes('Files')) dragging.value = true
}

// Pictures in the history are loaded with the login token, then shown from memory.
const thumbs = reactive<Record<number, string>>({})
async function fileUrl(id: number) {
  if (thumbs[id]) return thumbs[id]
  const res = await fetch(`${config.public.apiBase}/api/v1/admin/ai/files/${id}`, {
    headers: { authorization: `Bearer ${token.value}` },
  })
  if (!res.ok) throw new Error(`Error ${res.status}`)
  return (thumbs[id] = URL.createObjectURL(await res.blob()))
}
function thumb(f: FileInfo) {
  if (!(f.id in thumbs)) {
    thumbs[f.id] = ''
    fileUrl(f.id).catch(() => {})
  }
  return thumbs[f.id]
}
async function openFile(f: FileInfo) {
  const w = window.open('', '_blank')
  try {
    const url = await fileUrl(f.id)
    if (w) w.location.href = url
  } catch {
    w?.close()
  }
}
const FILE_ICON = { image: 'mdi-image-outline', pdf: 'mdi-file-pdf-box', text: 'mdi-file-document-outline' }
const fileIcon = (name: string, kind: keyof typeof FILE_ICON) =>
  /\.xlsx$/i.test(name)
    ? 'mdi-file-excel-outline'
    : /\.docx$/i.test(name)
      ? 'mdi-file-word-outline'
      : FILE_ICON[kind]
const fileSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`)

const canSend = computed(
  () => !!provider.value && !busy.value && !uploading.value && (!!input.value.trim() || readyFiles.value.length > 0),
)

async function send(text = input.value, withFiles = true) {
  const q = text.trim()
  const files = withFiles ? readyFiles.value : []
  if ((!q && !files.length) || busy.value || !provider.value || (withFiles && uploading.value)) return
  input.value = ''
  if (withFiles) pending.value = []
  busy.value = true
  messages.value.push({ role: 'user', content: q, files })
  const answer = reactive<Msg>({ role: 'assistant', content: '', provider: provider.value, streaming: true })
  messages.value.push(answer)
  scrollDown()
  abort = new AbortController()
  try {
    const res = await fetch(`${config.public.apiBase}/api/v1/admin/ai/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token.value}` },
      body: JSON.stringify({
        conversationId: current.value,
        provider: provider.value,
        text: q,
        fileIds: files.map((f) => f.id),
      }),
      signal: abort.signal,
    })
    if (!res.ok || !res.body) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j.message || `Error ${res.status}`)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let i
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i).replace(/^data:\s*/, '')
        buf = buf.slice(i + 2)
        let ev: {
          type: string
          text?: string
          message?: string
          conversationId?: number
          model?: string
          file?: FileInfo
        }
        try {
          ev = JSON.parse(chunk)
        } catch {
          continue
        }
        if (ev.type === 'start' && ev.conversationId) {
          current.value = ev.conversationId
          save('conversation', String(ev.conversationId))
        } else if (ev.type === 'file' && ev.file) {
          answer.files = [...(answer.files ?? []), ev.file]
          scrollDown()
        } else if (ev.type === 'status' && ev.text) {
          answer.status = ev.text
        } else if (ev.type === 'text' && ev.text) {
          answer.status = undefined
          answer.content += ev.text
          scrollDown()
        } else if (ev.type === 'done') {
          answer.model = ev.model
        } else if (ev.type === 'error') {
          answer.error = ev.message
        }
      }
    }
  } catch (e) {
    if ((e as Error).name !== 'AbortError') answer.error = (e as Error).message
  } finally {
    answer.streaming = false
    busy.value = false
    abort = null
    loadHistory().catch(() => {})
    scrollDown()
  }
}
function stop() {
  abort?.abort()
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    send()
  }
}
function retry(i: number) {
  const q = [...messages.value.slice(0, i)].reverse().find((m) => m.role === 'user')
  // The files are already in the conversation, so only the text is asked again.
  if (q) send(q.content || 'Please look at the attached file(s) again.', false)
}

// ── display ──
const md = (s: string) => DOMPurify.sanitize(marked.parse(s || '', { async: false, breaks: true }) as string)
const providerName = (k?: string | null) => providers.value.find((p) => p.key === k)?.name ?? k ?? ''
const ACCENT: Record<string, string> = { gemini: '#4285f4', chatgpt: '#10a37f', claude: '#d97757' }
const currentProvider = computed(() => providers.value.find((p) => p.key === provider.value))
const when = (iso: string) => {
  const d = new Date(iso)
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}
// ── buttons on every code block (Copy · Download) and table (Copy · Excel) ──
// The answer HTML is re-rendered while it streams, so buttons are (re)added
// after each update; one click handler on the list handles them all.
function addBlockButtons() {
  listEl.value?.querySelectorAll<HTMLElement>('.ai-md pre, .ai-md table').forEach((el) => {
    if (el.parentElement?.classList.contains('ai-block')) return
    const wrap = document.createElement('div')
    wrap.className = 'ai-block'
    el.replaceWith(wrap)
    wrap.appendChild(el)
    const bar = document.createElement('div')
    bar.className = 'ai-block-bar'
    const isTable = el.tagName === 'TABLE'
    const buttons: [string, string][] = isTable
      ? [
          ['copy', 'Copy table'],
          ['xlsx', '⬇ Excel'],
        ]
      : [
          ['copy', 'Copy code'],
          ['file', '⬇ Download'],
        ]
    for (const [action, label] of buttons) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'ai-block-copy'
      btn.dataset.action = action
      btn.textContent = label
      bar.appendChild(btn)
    }
    wrap.appendChild(bar)
  })
}
onUpdated(addBlockButtons)
/** Table → tab-separated text, so it pastes into Excel / Google Sheets as cells. */
const tableRows = (t: HTMLTableElement) =>
  Array.from(t.rows).map((r) => Array.from(r.cells).map((c) => c.innerText.replace(/\s+/g, ' ').trim()))
const tableText = (t: HTMLTableElement) => tableRows(t).map((r) => r.join('\t')).join('\n')

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')

async function tableToExcel(t: HTMLTableElement) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sheet1')
  const rows = tableRows(t)
  // Numbers stay numbers (but not phone numbers / codes with a leading 0).
  const cell = (v: string) => (/^-?(0|[1-9][\d,]*)(\.\d+)?$/.test(v) ? Number(v.replace(/,/g, '')) : v)
  rows.forEach((r, i) => {
    const row = ws.addRow(i === 0 ? r : r.map(cell))
    if (i === 0) {
      row.font = { bold: true }
      row.eachCell((c) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCD021' } }
      })
    }
  })
  ws.columns.forEach((col, i) => {
    col.width = Math.min(60, Math.max(10, ...rows.map((r) => (r[i] ?? '').length + 2)))
  })
  saveBlob(new Blob([await wb.xlsx.writeBuffer()]), `tiger-ai-table-${stamp()}.xlsx`)
}

const EXT: Record<string, string> = {
  javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts', python: 'py', py: 'py', sql: 'sql', json: 'json',
  csv: 'csv', tsv: 'tsv', html: 'html', xml: 'xml', css: 'css', bash: 'sh', sh: 'sh', shell: 'sh', yaml: 'yml',
  yml: 'yml', markdown: 'md', md: 'md', java: 'java', php: 'php', vue: 'vue', go: 'go', csharp: 'cs', cs: 'cs',
  kotlin: 'kt', ruby: 'rb', powershell: 'ps1', ini: 'ini', dockerfile: 'Dockerfile', text: 'txt', plaintext: 'txt',
}
function codeToFile(pre: HTMLElement) {
  const lang = pre.querySelector('code')?.className.match(/language-([\w+-]+)/)?.[1]?.toLowerCase() ?? 'text'
  const ext = EXT[lang] ?? 'txt'
  const text = pre.innerText
  const bom = ext === 'csv' || ext === 'tsv' ? '﻿' : '' // Excel reads Lao text in CSV correctly
  saveBlob(new Blob([bom + text], { type: 'text/plain;charset=utf-8' }), `tiger-ai-${stamp()}.${ext}`)
}

async function onListClick(e: MouseEvent) {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.ai-block-copy')
  if (!btn) return
  const block = btn.closest('.ai-block')?.querySelector<HTMLElement>('pre, table')
  if (!block) return
  const isTable = block.tagName === 'TABLE'
  if (btn.dataset.action === 'xlsx') return tableToExcel(block as HTMLTableElement)
  if (btn.dataset.action === 'file') return codeToFile(block)
  try {
    await navigator.clipboard.writeText(isTable ? tableText(block as HTMLTableElement) : block.innerText)
    const label = btn.textContent
    btn.textContent = '✓ Copied'
    setTimeout(() => (btn.textContent = label), 1500)
  } catch {
    /* clipboard blocked */
  }
}

// ── the whole answer as a Word document or PDF ──
function answerHtml(e: MouseEvent) {
  const md = (e.currentTarget as HTMLElement).closest('.ai-answer')?.querySelector('.ai-md')
  if (!md) return ''
  const copy = md.cloneNode(true) as HTMLElement
  copy.querySelectorAll('.ai-block-bar').forEach((b) => b.remove())
  return copy.innerHTML
}
const DOC_CSS =
  'body{font-family:"Phetsarath OT","Noto Sans Lao",Arial,sans-serif;font-size:12pt;line-height:1.5}' +
  'table{border-collapse:collapse}th,td{border:1px solid #999;padding:4px 8px}th{background:#fcd021}' +
  'pre{background:#f4f4f4;padding:8px;white-space:pre-wrap}'
function downloadWord(e: MouseEvent) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>${DOC_CSS}</style></head><body>${answerHtml(e)}</body></html>`
  saveBlob(new Blob(['﻿' + html], { type: 'application/msword' }), `tiger-ai-${stamp()}.doc`)
}
function downloadPdf(e: MouseEvent) {
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>Tiger AI</title><style>${DOC_CSS}</style></head><body>${answerHtml(e)}</body></html>`,
  )
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 300) // "Save as PDF" in the print window
}
async function downloadFile(f: FileInfo) {
  saveBlob(await (await fetch(await fileUrl(f.id))).blob(), f.name)
}

const copied = ref<number | null>(null)
async function copy(text: string, i: number) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = i
    setTimeout(() => (copied.value = null), 1500)
  } catch {
    /* clipboard blocked */
  }
}
const SUGGESTIONS = [
  'ແປປະໂຫຍກນີ້ເປັນພາສາອັງກິດ:',
  'Write a polite SMS to a customer about a package renewal',
  'Explain eSIM to a customer in simple Lao',
]
// The tiger says hello once per browser session, a moment after the page opens.
const greet = ref(false)
onMounted(() => {
  let seen = '1'
  try {
    seen = sessionStorage.getItem('ai-chat-greeted') ?? ''
    sessionStorage.setItem('ai-chat-greeted', '1')
  } catch {
    /* storage blocked: skip the greeting */
  }
  if (seen || open.value) return
  setTimeout(() => (greet.value = true), 1200)
  setTimeout(() => (greet.value = false), 7000)
})
const isAdmin = computed(() => admin.value?.kind !== 'ccare' && admin.value?.role === 'admin')
</script>

<template>
  <div v-if="token && admin && admin.kind !== 'ccare'" class="ai-root">
    <!-- launcher -->
    <button v-if="!open" class="ai-fab" title="Tiger AI" aria-label="Open Tiger AI" @click="open = true">
      <span class="ai-fab-hello" :class="{ show: greet }">ສະບາຍດີ! ມີຫຍັງໃຫ້ຊ່ວຍບໍ? 🐯</span>
      <span class="ai-fab-ring" />
      <span class="ai-fab-face"><AiTiger :size="54" mood="wave" /></span>
    </button>

    <!-- panel -->
    <section
      v-else
      class="ai-panel"
      :class="{ wide }"
      @dragover.prevent="onDragOver"
      @dragleave.self="dragging = false"
      @drop.prevent="onDrop"
    >
      <div v-if="dragging" class="ai-drop" @dragleave="dragging = false">
        <AiTiger :size="72" mood="happy" />
        <div class="font-weight-bold mt-2">Drop files here</div>
        <div class="text-caption">Pictures, PDF, Word, Excel, CSV, text · up to 10 MB each</div>
      </div>
      <header class="ai-head">
        <div class="ai-brand">
          <span class="ai-avatar"><AiTiger :size="40" :mood="busy ? 'think' : 'idle'" /></span>
          <div class="flex-grow-1 min-w-0">
            <div class="ai-title">Tiger AI</div>
            <div class="ai-status">
              <span class="ai-dot" :class="{ busy }" />
              {{ busy ? 'Thinking…' : currentProvider ? `${currentProvider.name} · online` : 'Assistant' }}
            </div>
          </div>
          <v-btn icon="mdi-history" variant="text" size="small" title="History" @click="showHistory = !showHistory" />
          <v-btn icon="mdi-plus" variant="text" size="small" title="New chat" @click="newChat" />
          <v-btn
            :icon="wide ? 'mdi-arrow-collapse' : 'mdi-arrow-expand'"
            variant="text"
            size="small"
            :title="wide ? 'Smaller' : 'Bigger'"
            @click="wide = !wide"
          />
          <v-btn icon="mdi-close" variant="text" size="small" title="Close" @click="open = false" />
        </div>
        <div v-if="providers.length > 1" class="ai-chips">
          <button
            v-for="p in providers"
            :key="p.key"
            class="ai-chip"
            :class="{ on: provider === p.key }"
            :style="{ '--c': ACCENT[p.key] }"
            :title="`${p.name} · ${p.model}`"
            @click="provider = p.key"
          >
            {{ p.name }}
          </button>
        </div>
      </header>

      <div class="ai-body">
        <!-- history -->
        <aside v-if="showHistory" class="ai-history">
          <button class="ai-new" @click="newChat"><v-icon icon="mdi-plus" size="16" />New chat</button>
          <div v-if="!conversations.length" class="text-caption text-medium-emphasis pa-3">No conversations yet</div>
          <button
            v-for="c in conversations"
            :key="c.id"
            class="ai-conv"
            :class="{ on: c.id === current }"
            @click="openConversation(c.id)"
          >
            <span class="ai-conv-title">{{ c.title || 'Untitled' }}</span>
            <span class="ai-conv-meta">{{ providerName(c.provider) }} · {{ when(c.updatedAt) }}</span>
          </button>
        </aside>

        <!-- conversation -->
        <div class="ai-chat">
          <div ref="listEl" class="ai-list" @click="onListClick">
            <div v-if="!providers.length && loaded" class="ai-empty">
              <div class="ai-hero"><AiTiger :size="80" mood="think" /></div>
              <div class="font-weight-bold">No AI is set up yet</div>
              <div class="text-caption">
                <template v-if="isAdmin">
                  Add <code>GEMINI_API_KEY</code> (free, from Google AI Studio) to <code>api/.env.production</code> and
                  restart the API. <code>OPENAI_API_KEY</code> / <code>ANTHROPIC_API_KEY</code> add ChatGPT and Claude.
                </template>
                <template v-else>Ask an administrator to set up the AI assistant.</template>
              </div>
            </div>
            <div v-else-if="initError" class="ai-empty">
              <div class="ai-hero"><AiTiger :size="80" mood="think" /></div>
              <div class="font-weight-bold mb-1">The AI service is not reachable</div>
              <div class="text-caption mb-3">{{ initError }}</div>
              <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" @click="retryInit">Try again</v-btn>
            </div>
            <div v-else-if="!messages.length" class="ai-empty">
              <div class="ai-hero"><AiTiger :size="96" mood="wave" /></div>
              <div class="ai-hero-title">ສະບາຍດີ! I'm Tiger AI</div>
              <div class="font-weight-bold mb-1">Ask {{ currentProvider?.name ?? 'the AI' }} anything</div>
              <div class="text-caption mb-3">Lao, Hmong, Thai or English. Your chats are saved in History.</div>
              <button v-for="s in SUGGESTIONS" :key="s" class="ai-suggest" @click="input = s">{{ s }}</button>
            </div>

            <div v-for="(m, i) in messages" :key="m.id ?? `n${i}`" class="ai-msg" :class="m.role">
              <div v-if="m.role === 'user'" class="ai-user">
                <div v-if="m.files?.length" class="ai-files">
                  <template v-for="f in m.files" :key="f.id">
                    <button v-if="f.kind === 'image'" class="ai-img" :title="f.name" @click="openFile(f)">
                      <img v-if="thumb(f)" :src="thumb(f)" :alt="f.name" />
                      <v-progress-circular v-else indeterminate size="18" width="2" />
                    </button>
                    <button v-else class="ai-file" :title="f.name" @click="openFile(f)">
                      <v-icon :icon="fileIcon(f.name, f.kind)" size="22" />
                      <span class="ai-file-name">{{ f.name }}</span>
                      <span class="ai-file-size">{{ fileSize(f.size) }}</span>
                    </button>
                  </template>
                </div>
                <div v-if="m.content" class="ai-bubble">{{ m.content }}</div>
                <button class="ai-link ai-user-copy" @click="copy(m.content, i)">
                  <v-icon :icon="copied === i ? 'mdi-check' : 'mdi-content-copy'" size="14" />
                  {{ copied === i ? 'Copied' : 'Copy' }}
                </button>
              </div>
              <div v-else class="ai-answer">
                <div class="ai-who" :style="{ color: ACCENT[m.provider ?? ''] }">
                  <AiTiger :size="22" :mood="m.streaming ? 'think' : m.error ? 'idle' : 'happy'" />
                  {{ providerName(m.provider) }}
                  <span v-if="m.model" class="text-medium-emphasis">· {{ m.model }}</span>
                </div>
                <!-- eslint-disable-next-line vue/no-v-html -- sanitised with DOMPurify -->
                <div v-if="m.content" class="ai-md" v-html="md(m.content)" />
                <div v-if="m.files?.length" class="ai-made">
                  <figure v-for="f in m.files" :key="f.id" class="ai-made-img">
                    <button :title="`Open ${f.name}`" @click="openFile(f)">
                      <img v-if="thumb(f)" :src="thumb(f)" :alt="f.name" />
                      <v-progress-circular v-else indeterminate size="22" width="2" />
                    </button>
                    <figcaption>
                      <button class="ai-link" @click="downloadFile(f)">
                        <v-icon icon="mdi-download" size="14" />Download
                      </button>
                      <button class="ai-link" @click="openFile(f)">
                        <v-icon icon="mdi-open-in-new" size="14" />Open
                      </button>
                    </figcaption>
                  </figure>
                </div>
                <div v-else-if="m.streaming" class="ai-typing">
                  <span /><span /><span />
                  <em v-if="m.status" class="ai-status-line">{{ m.status }}</em>
                </div>
                <div v-if="m.error" class="ai-error">
                  <v-icon icon="mdi-alert-circle-outline" size="16" />{{ m.error }}
                  <button class="ai-link" @click="retry(i)">Try again</button>
                </div>
                <div v-if="m.content && !m.streaming" class="ai-tools">
                  <button class="ai-link" @click="copy(m.content, i)">
                    <v-icon :icon="copied === i ? 'mdi-check' : 'mdi-content-copy'" size="14" />
                    {{ copied === i ? 'Copied' : 'Copy' }}
                  </button>
                  <button class="ai-link" title="Download the answer as a Word document" @click="downloadWord">
                    <v-icon icon="mdi-file-word-outline" size="14" />Word
                  </button>
                  <button class="ai-link" title="Save the answer as PDF (print → Save as PDF)" @click="downloadPdf">
                    <v-icon icon="mdi-file-pdf-box" size="14" />PDF
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="pending.length" class="ai-pending">
            <div v-for="p in pending" :key="p.key" class="ai-pchip" :class="p.status" :title="p.error || p.name">
              <img v-if="p.preview" :src="p.preview" alt="" />
              <v-icon v-else :icon="fileIcon(p.name, p.kind)" size="22" />
              <div class="ai-pchip-text">
                <span class="ai-file-name">{{ p.name }}</span>
                <span class="ai-file-size">
                  {{ p.status === 'uploading' ? 'Uploading…' : p.status === 'error' ? p.error : fileSize(p.file?.size ?? 0) }}
                </span>
              </div>
              <v-progress-circular v-if="p.status === 'uploading'" indeterminate size="16" width="2" />
              <button class="ai-pchip-x" title="Remove" @click="removePending(p)">
                <v-icon icon="mdi-close" size="14" />
              </button>
            </div>
          </div>
          <footer class="ai-input">
            <input ref="fileEl" type="file" multiple hidden :accept="AI_ACCEPT" @change="onPicked" />
            <v-btn
              icon="mdi-paperclip"
              variant="text"
              size="small"
              title="Attach pictures or files (or paste / drop them here)"
              :disabled="!provider || pending.length >= 10"
              @click="pickFiles"
            />
            <textarea
              ref="inputEl"
              v-model="input"
              rows="1"
              :placeholder="provider ? `Message ${currentProvider?.name}…  (Enter to send, Shift+Enter new line)` : ''"
              :disabled="!provider"
              @keydown="onKey"
              @paste="onPaste"
            />
            <v-btn v-if="busy" icon="mdi-stop" color="error" variant="tonal" size="small" title="Stop" @click="stop" />
            <v-btn
              v-else
              icon="mdi-arrow-up"
              color="primary"
              variant="flat"
              size="small"
              :disabled="!canSend"
              title="Send"
              @click="send()"
            />
          </footer>
          <div class="ai-note">AI can be wrong. Do not paste customer personal data, passwords or SMS codes.</div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ai-fab {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 2000;
  width: 72px;
  height: 72px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  animation: ai-float 3.2s ease-in-out infinite;
}
.ai-fab-face {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 25%, #fff7d6, #ffd35a 55%, #f5b301);
  box-shadow:
    0 10px 28px rgba(245, 160, 0, 0.45),
    inset 0 -4px 0 rgba(0, 0, 0, 0.08);
  transition: transform 0.2s;
}
.ai-fab:hover .ai-fab-face {
  transform: scale(1.08) rotate(-4deg);
}
.ai-fab-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: rgba(255, 196, 0, 0.45);
  animation: ai-ping 2.6s cubic-bezier(0, 0, 0.2, 1) infinite;
}
.ai-fab-hello {
  position: absolute;
  right: 84px;
  bottom: 18px;
  white-space: nowrap;
  padding: 8px 14px;
  border-radius: 16px 16px 4px 16px;
  font-size: 0.85rem;
  font-weight: 700;
  color: #2b1a10;
  background: #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  opacity: 0;
  transform: translateX(8px) scale(0.9);
  transform-origin: right bottom;
  pointer-events: none;
  transition:
    opacity 0.25s,
    transform 0.25s;
}
.ai-fab-hello.show,
.ai-fab:hover .ai-fab-hello {
  opacity: 1;
  transform: none;
}
@keyframes ai-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}
@keyframes ai-ping {
  0% {
    transform: scale(1);
    opacity: 0.7;
  }
  80%,
  100% {
    transform: scale(1.55);
    opacity: 0;
  }
}
.ai-panel {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2000;
  width: min(440px, calc(100vw - 24px));
  height: min(680px, calc(100vh - 40px));
  display: flex;
  flex-direction: column;
  border-radius: 22px;
  overflow: hidden;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  box-shadow: 0 28px 70px rgba(0, 0, 0, 0.25);
  animation: ai-pop 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.2);
  transform-origin: right bottom;
}
@keyframes ai-pop {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.92);
  }
}
.ai-panel.wide {
  width: min(1040px, calc(100vw - 24px));
  height: calc(100vh - 40px);
}
.ai-head {
  position: relative;
  padding: 10px 8px 10px 12px;
  color: #2b1a10;
  background: linear-gradient(135deg, #ffe07a 0%, #ffc21a 55%, #f9a11b 100%);
  overflow: hidden;
}
.ai-head::after {
  /* faint tiger stripes in the header */
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    115deg,
    transparent 0 46px,
    rgba(43, 26, 16, 0.07) 46px 56px,
    transparent 56px 80px
  );
}
.ai-head :deep(.v-btn) {
  color: #2b1a10;
  position: relative;
  z-index: 1;
}
.ai-brand {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}
.ai-avatar {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  flex: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.75);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}
.ai-title {
  font-weight: 800;
  font-size: 1.05rem;
  line-height: 1.2;
}
.ai-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  opacity: 0.8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ai-dot {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 50%;
  background: #16a34a;
  box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.25);
}
.ai-dot.busy {
  background: #e11d48;
  box-shadow: 0 0 0 3px rgba(225, 29, 72, 0.25);
  animation: ai-blinkdot 0.9s infinite;
}
@keyframes ai-blinkdot {
  50% {
    opacity: 0.3;
  }
}
.ai-chips {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.ai-hero {
  display: grid;
  place-items: center;
  width: 124px;
  height: 124px;
  margin-bottom: 10px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 196, 0, 0.3), rgba(255, 196, 0, 0) 70%);
}
.ai-hero-title {
  font-size: 1.15rem;
  font-weight: 800;
  margin-bottom: 2px;
  color: rgb(var(--v-theme-on-surface));
}
.ai-chip {
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 700;
  border: 1px solid rgba(43, 26, 16, 0.25);
  color: #2b1a10;
  background: rgba(255, 255, 255, 0.45);
}
.ai-chip.on {
  color: #fff;
  background: var(--c);
  border-color: var(--c);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
}
.ai-body {
  position: relative;
  flex: 1;
  display: flex;
  min-height: 0;
}
.ai-history {
  width: 240px;
  flex: none;
  overflow-y: auto;
  padding: 8px;
  border-right: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgba(var(--v-theme-on-surface), 0.02);
}
.ai-panel:not(.wide) .ai-history {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 2;
  width: 80%;
  background: rgb(var(--v-theme-surface));
  box-shadow: 8px 0 24px rgba(0, 0, 0, 0.12);
}
.ai-new {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 10px;
  margin-bottom: 6px;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.85rem;
  border: 1px dashed rgba(var(--v-theme-on-surface), 0.25);
}
.ai-conv {
  display: flex;
  flex-direction: column;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border-radius: 10px;
}
.ai-conv:hover,
.ai-conv.on {
  background: rgba(var(--v-theme-primary), 0.14);
}
.ai-conv-title {
  font-size: 0.85rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ai-conv-meta {
  font-size: 0.72rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.ai-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.ai-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.ai-panel.wide .ai-list {
  padding: 24px max(24px, calc((100% - 760px) / 2));
}
.ai-empty {
  margin: auto;
  max-width: 340px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), 0.75);
}
.ai-suggest {
  width: 100%;
  margin-top: 6px;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 0.82rem;
  text-align: left;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}
.ai-suggest:hover {
  border-color: #f5b301;
  background: rgba(255, 196, 0, 0.12);
}
@media (prefers-reduced-motion: reduce) {
  .ai-fab,
  .ai-fab-ring,
  .ai-panel {
    animation: none;
  }
}
.ai-msg.user {
  display: flex;
  justify-content: flex-end;
}
.ai-bubble {
  max-width: 85%;
  padding: 10px 14px;
  border-radius: 16px 16px 4px 16px;
  white-space: pre-wrap;
  word-break: break-word;
  background: rgba(var(--v-theme-primary), 0.2);
}
.ai-who {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  margin-bottom: 4px;
}
.ai-md {
  font-size: 0.92rem;
  line-height: 1.6;
  word-break: break-word;
}
.ai-md :deep(p) {
  margin: 0 0 8px;
}
.ai-md :deep(ul),
.ai-md :deep(ol) {
  padding-left: 22px;
  margin: 0 0 8px;
}
.ai-md :deep(pre) {
  padding: 10px 12px;
  border-radius: 10px;
  overflow-x: auto;
  font-size: 0.82rem;
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.ai-md :deep(code) {
  font-family: Menlo, Consolas, monospace;
  font-size: 0.85em;
}
.ai-md :deep(table) {
  border-collapse: collapse;
  margin-bottom: 8px;
}
.ai-md :deep(th),
.ai-md :deep(td) {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  padding: 4px 8px;
}
.ai-typing {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 0;
}
.ai-typing span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(var(--v-theme-on-surface), 0.4);
  animation: ai-dot 1.2s infinite ease-in-out;
}
.ai-typing span:nth-child(2) {
  animation-delay: 0.15s;
}
.ai-typing span:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes ai-dot {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-3px);
  }
}
.ai-error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 0.8rem;
  color: rgb(var(--v-theme-error));
  background: rgba(var(--v-theme-error), 0.08);
}
.ai-tools {
  margin-top: 4px;
}
.ai-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.ai-link:hover {
  color: rgb(var(--v-theme-on-surface));
}
.ai-input {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin: 0 12px;
  padding: 8px 8px 8px 4px;
  border-radius: 16px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
}
.ai-panel.wide .ai-input {
  width: min(760px, calc(100% - 24px));
  align-self: center;
}
.ai-input textarea {
  flex: 1;
  resize: none;
  outline: none;
  max-height: 160px;
  field-sizing: content;
  font: inherit;
  font-size: 0.92rem;
  color: inherit;
  background: transparent;
}
.ai-note {
  padding: 6px 12px 10px;
  font-size: 0.7rem;
  text-align: center;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.ai-user {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  max-width: 85%;
}
.ai-user .ai-bubble {
  max-width: 100%;
}
.ai-user-copy {
  margin-top: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}
.ai-user:hover .ai-user-copy {
  opacity: 1;
}
/* code blocks and tables get their own Copy button (added in script) */
.ai-md :deep(.ai-block) {
  position: relative;
  margin-bottom: 8px;
  overflow-x: auto;
}
.ai-md :deep(.ai-block pre),
.ai-md :deep(.ai-block table) {
  margin-bottom: 0;
}
.ai-md :deep(.ai-block-bar) {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  gap: 4px;
}
.ai-md :deep(.ai-block-copy) {
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 0.72rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.75);
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  opacity: 0.85;
}
.ai-md :deep(.ai-block-copy:hover) {
  opacity: 1;
  border-color: #f5b301;
}
.ai-md :deep(.ai-block:has(table)) {
  padding-top: 30px;
}
.ai-md :deep(.ai-block pre) {
  padding-top: 34px;
}

/* pictures made by the AI */
.ai-made {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 6px 0;
}
.ai-made-img {
  margin: 0;
}
.ai-made-img > button {
  display: grid;
  place-items: center;
  width: min(360px, 100%);
  min-height: 160px;
  border-radius: 14px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.05);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
}
.ai-made-img img {
  display: block;
  width: 100%;
  height: auto;
}
.ai-made-img figcaption {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}
.ai-tools {
  display: flex;
  gap: 14px;
}

/* attachments */
.ai-drop {
  position: absolute;
  inset: 8px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
  border: 2px dashed #f5b301;
  background: rgba(255, 246, 214, 0.95);
  color: #2b1a10;
  pointer-events: none;
}
.ai-files {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  margin-bottom: 4px;
}
.ai-img {
  display: grid;
  place-items: center;
  width: 140px;
  height: 140px;
  border-radius: 14px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.ai-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ai-file,
.ai-pchip {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 240px;
  padding: 6px 10px;
  border-radius: 12px;
  text-align: left;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  background: rgb(var(--v-theme-surface));
}
.ai-file:hover {
  border-color: #f5b301;
}
.ai-file,
.ai-pchip-text {
  min-width: 0;
}
.ai-file {
  flex-direction: row;
}
.ai-pchip-text {
  display: flex;
  flex-direction: column;
  flex: 1;
}
.ai-file-name {
  font-size: 0.8rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ai-file-size {
  font-size: 0.7rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ai-pending {
  display: flex;
  gap: 6px;
  margin: 0 12px 6px;
  overflow-x: auto;
  padding-bottom: 2px;
}
.ai-pchip {
  flex: none;
  max-width: 220px;
}
.ai-pchip img {
  width: 36px;
  height: 36px;
  object-fit: cover;
  border-radius: 8px;
}
.ai-pchip.error {
  border-color: rgb(var(--v-theme-error));
  background: rgba(var(--v-theme-error), 0.06);
}
.ai-pchip.error .ai-file-size {
  color: rgb(var(--v-theme-error));
  white-space: normal;
}
.ai-pchip-x {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  flex: none;
  border-radius: 50%;
  background: rgba(var(--v-theme-on-surface), 0.08);
}
.ai-pchip-x:hover {
  background: rgba(var(--v-theme-on-surface), 0.18);
}
.ai-status-line {
  margin-left: 6px;
  font-size: 0.75rem;
  font-style: normal;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
</style>
