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
}
interface Conversation {
  id: number
  title: string | null
  provider: string | null
  updatedAt: string
}
interface Msg {
  id?: number
  role: 'user' | 'assistant'
  content: string
  provider?: string | null
  model?: string | null
  error?: string | null
  streaming?: boolean
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
watch(open, (v) => {
  save('open', v ? '1' : '0')
  if (v) init()
})
watch(wide, (v) => save('wide', v ? '1' : '0'))
watch(provider, (v) => v && save('provider', v))

async function init() {
  if (loaded.value) return
  loaded.value = true
  try {
    providers.value = await api<Provider[]>('/ai/providers')
    const pref = saved('provider')
    provider.value = (providers.value.find((p) => p.key === pref) ?? providers.value[0])?.key ?? null
    await loadHistory()
    const last = Number(saved('conversation'))
    if (last && conversations.value.some((c) => c.id === last)) await openConversation(last)
  } catch {
    loaded.value = false
  }
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
async function send(text = input.value) {
  const q = text.trim()
  if (!q || busy.value || !provider.value) return
  input.value = ''
  busy.value = true
  messages.value.push({ role: 'user', content: q })
  const answer = reactive<Msg>({ role: 'assistant', content: '', provider: provider.value, streaming: true })
  messages.value.push(answer)
  scrollDown()
  abort = new AbortController()
  try {
    const res = await fetch(`${config.public.apiBase}/api/v1/admin/ai/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token.value}` },
      body: JSON.stringify({ conversationId: current.value, provider: provider.value, text: q }),
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
        let ev: { type: string; text?: string; message?: string; conversationId?: number; model?: string }
        try {
          ev = JSON.parse(chunk)
        } catch {
          continue
        }
        if (ev.type === 'start' && ev.conversationId) {
          current.value = ev.conversationId
          save('conversation', String(ev.conversationId))
        } else if (ev.type === 'text' && ev.text) {
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
  if (q) send(q.content)
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
const isAdmin = computed(() => admin.value?.kind !== 'ccare' && admin.value?.role === 'admin')
</script>

<template>
  <div v-if="token" class="ai-root">
    <!-- launcher -->
    <v-btn
      v-if="!open"
      class="ai-fab"
      color="primary"
      size="x-large"
      icon
      elevation="8"
      title="AI assistant"
      @click="open = true"
    >
      <v-icon icon="mdi-robot-happy-outline" color="black" size="28" />
    </v-btn>

    <!-- panel -->
    <section v-else class="ai-panel" :class="{ wide }">
      <header class="ai-head">
        <v-btn icon="mdi-history" variant="text" size="small" title="History" @click="showHistory = !showHistory" />
        <div class="d-flex ga-1 flex-grow-1 flex-wrap">
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
        <v-btn icon="mdi-plus" variant="text" size="small" title="New chat" @click="newChat" />
        <v-btn
          :icon="wide ? 'mdi-arrow-collapse' : 'mdi-arrow-expand'"
          variant="text"
          size="small"
          :title="wide ? 'Smaller' : 'Bigger'"
          @click="wide = !wide"
        />
        <v-btn icon="mdi-close" variant="text" size="small" title="Close" @click="open = false" />
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
          <div ref="listEl" class="ai-list">
            <div v-if="!providers.length && loaded" class="ai-empty">
              <v-icon icon="mdi-robot-off-outline" size="40" class="mb-2" />
              <div class="font-weight-bold">No AI is set up yet</div>
              <div class="text-caption">
                <template v-if="isAdmin">
                  Add <code>GEMINI_API_KEY</code> (free, from Google AI Studio) to <code>api/.env.production</code> and
                  restart the API. <code>OPENAI_API_KEY</code> / <code>ANTHROPIC_API_KEY</code> add ChatGPT and Claude.
                </template>
                <template v-else>Ask an administrator to set up the AI assistant.</template>
              </div>
            </div>
            <div v-else-if="!messages.length" class="ai-empty">
              <v-icon icon="mdi-robot-happy-outline" size="40" class="mb-2" />
              <div class="font-weight-bold">Ask {{ currentProvider?.name ?? 'the AI' }} anything</div>
              <div class="text-caption mb-3">Lao, Hmong, Thai or English. Your chats are saved in History.</div>
              <button v-for="s in SUGGESTIONS" :key="s" class="ai-suggest" @click="input = s">{{ s }}</button>
            </div>

            <div v-for="(m, i) in messages" :key="m.id ?? `n${i}`" class="ai-msg" :class="m.role">
              <div v-if="m.role === 'user'" class="ai-bubble">{{ m.content }}</div>
              <div v-else class="ai-answer">
                <div class="ai-who" :style="{ color: ACCENT[m.provider ?? ''] }">
                  <v-icon icon="mdi-robot-outline" size="14" />{{ providerName(m.provider) }}
                  <span v-if="m.model" class="text-medium-emphasis">· {{ m.model }}</span>
                </div>
                <!-- eslint-disable-next-line vue/no-v-html -- sanitised with DOMPurify -->
                <div v-if="m.content" class="ai-md" v-html="md(m.content)" />
                <div v-else-if="m.streaming" class="ai-typing"><span /><span /><span /></div>
                <div v-if="m.error" class="ai-error">
                  <v-icon icon="mdi-alert-circle-outline" size="16" />{{ m.error }}
                  <button class="ai-link" @click="retry(i)">Try again</button>
                </div>
                <div v-if="m.content && !m.streaming" class="ai-tools">
                  <button class="ai-link" @click="copy(m.content, i)">
                    <v-icon :icon="copied === i ? 'mdi-check' : 'mdi-content-copy'" size="14" />
                    {{ copied === i ? 'Copied' : 'Copy' }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <footer class="ai-input">
            <textarea
              ref="inputEl"
              v-model="input"
              rows="1"
              :placeholder="provider ? `Message ${currentProvider?.name}…  (Enter to send, Shift+Enter new line)` : ''"
              :disabled="!provider"
              @keydown="onKey"
            />
            <v-btn v-if="busy" icon="mdi-stop" color="error" variant="tonal" size="small" title="Stop" @click="stop" />
            <v-btn
              v-else
              icon="mdi-arrow-up"
              color="primary"
              variant="flat"
              size="small"
              :disabled="!input.trim() || !provider"
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
  right: 24px;
  bottom: 24px;
  z-index: 2000;
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
  border-radius: 20px;
  overflow: hidden;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.22);
}
.ai-panel.wide {
  width: min(1040px, calc(100vw - 24px));
  height: calc(100vh - 40px);
}
.ai-head {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 8px 8px 6px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
.ai-chip {
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 700;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.ai-chip.on {
  color: #fff;
  background: var(--c);
  border-color: var(--c);
}
.ai-body {
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
  top: 53px;
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
  background: rgba(var(--v-theme-on-surface), 0.04);
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
  gap: 4px;
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
  padding: 8px 8px 8px 14px;
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
</style>
