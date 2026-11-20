<script setup lang="ts">
import type { AppUser, Paged, TrackedEvent } from '~/composables/useApi'

/**
 * One search box for everything: users (name / phone) and actions
 * (API, screen, server message, numbers inside details such as a transfer
 * receiver). Results appear while typing.
 */
const api = useApi()
const q = ref('')
const open = ref(false)
const loading = ref(false)
const users = ref<AppUser[]>([])
const events = ref<TrackedEvent[]>([])
const totals = reactive({ users: 0, events: 0 })
const active = ref(-1) // keyboard selection
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0

watch(q, (v) => {
  clearTimeout(timer)
  const term = v.trim()
  if (term.length < 2) {
    users.value = []
    events.value = []
    totals.users = totals.events = 0
    return
  }
  timer = setTimeout(() => run(term), 250)
})

async function run(term: string) {
  const my = ++seq
  loading.value = true
  try {
    const [u, e] = await Promise.all([
      api<Paged<AppUser>>('/users', { query: { search: term, pageSize: 5 } }),
      api<Paged<TrackedEvent>>('/events', { query: { search: term, pageSize: 6 } }),
    ])
    if (my !== seq) return // a newer search finished first
    users.value = u.items
    events.value = e.items
    totals.users = u.total
    totals.events = e.total
    active.value = -1
    open.value = true
  } catch {
    // keep previous results
  } finally {
    if (my === seq) loading.value = false
  }
}

const flat = computed(() => [
  ...users.value.map((u) => ({ kind: 'user' as const, to: `/users/${u.id}` })),
  ...events.value.map((e) => ({ kind: 'event' as const, to: `/events/${e.id}` })),
])

function go(to: string) {
  open.value = false
  q.value = ''
  navigateTo(to)
}
function onEnter() {
  const term = q.value.trim()
  if (!term) return
  if (active.value >= 0 && flat.value[active.value]) return go(flat.value[active.value]!.to)
  // No selection: show everything that matches in the activity log.
  go(`/events?search=${encodeURIComponent(term)}`)
}
function move(d: number) {
  if (!flat.value.length) return
  open.value = true
  active.value = (active.value + d + flat.value.length) % flat.value.length
}
const idx = (kind: 'user' | 'event', i: number) => (kind === 'user' ? i : users.value.length + i)

// close when clicking outside
const root = ref<HTMLElement | null>(null)
function onDocClick(ev: MouseEvent) {
  if (root.value && !root.value.contains(ev.target as Node)) open.value = false
}
onMounted(() => document.addEventListener('mousedown', onDocClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick))

const showPanel = computed(() => open.value && q.value.trim().length >= 2)
</script>

<template>
  <div ref="root" class="gsearch">
    <v-text-field
      v-model="q"
      placeholder="Search users, phone numbers, actions, APIs…"
      prepend-inner-icon="mdi-magnify"
      :loading="loading"
      hide-details
      single-line
      clearable
      density="compact"
      variant="solo-filled"
      flat
      rounded="lg"
      class="gsearch-field"
      @focus="open = true"
      @keydown.enter.prevent="onEnter"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.esc="open = false"
    />

    <transition name="pop">
      <div v-if="showPanel" class="panel">
        <!-- users -->
        <div class="section">
          <div class="section-head">
            <span><v-icon icon="mdi-account-group-outline" size="16" /> Users</span>
            <span class="count">{{ totals.users }}</span>
          </div>
          <a
            v-for="(u, i) in users"
            :key="u.id"
            class="row"
            :class="{ sel: active === idx('user', i) }"
            @mousedown.prevent="go(`/users/${u.id}`)"
          >
            <v-avatar color="primary" variant="tonal" size="32">
              <span class="text-caption font-weight-bold">{{ initials(u) }}</span>
            </v-avatar>
            <div class="flex-grow-1" style="min-width: 0">
              <div class="row-title text-truncate">{{ fullName(u) }}</div>
              <div class="row-sub text-mono phone">{{ formatPhone(u.msisdn) }}</div>
            </div>
            <span class="row-meta">{{ timeAgo(u.lastSeenAt) }}</span>
          </a>
          <div v-if="!users.length && !loading" class="empty">No users match</div>
          <a v-if="totals.users > users.length" class="more" @mousedown.prevent="go(`/users?search=${encodeURIComponent(q.trim())}`)">
            See all {{ totals.users }} users <v-icon icon="mdi-arrow-right" size="14" />
          </a>
        </div>

        <!-- actions -->
        <div class="section">
          <div class="section-head">
            <span><v-icon icon="mdi-timeline-text-outline" size="16" /> Actions</span>
            <span class="count">{{ totals.events }}</span>
          </div>
          <a
            v-for="(e, i) in events"
            :key="e.id"
            class="row"
            :class="{ sel: active === idx('event', i) }"
            @mousedown.prevent="go(`/events/${e.id}`)"
          >
            <v-avatar
              :color="e.type === 'api' ? (e.success === false ? 'error' : e.success ? 'success' : 'purple') : EVENT_META[e.type]?.color"
              variant="tonal"
              rounded="lg"
              size="32"
            >
              <v-icon :icon="EVENT_META[e.type]?.icon" size="16" />
            </v-avatar>
            <div class="flex-grow-1" style="min-width: 0">
              <div class="row-title text-truncate">
                {{ eventTitle(e) }}
                <span v-if="e.success === false" class="tag bad">Failed</span>
                <span v-else-if="e.success" class="tag ok">Success</span>
              </div>
              <div class="row-sub text-truncate">
                <template v-if="e.type === 'api' && apiSummaryLine(e)">{{ apiSummaryLine(e) }} · </template>
                {{ e.user ? fullName(e.user) : 'Guest' }}
              </div>
            </div>
            <span class="row-meta text-mono">{{ formatTime(e.occurredAt) }}</span>
          </a>
          <div v-if="!events.length && !loading" class="empty">No actions match</div>
          <a class="more" @mousedown.prevent="go(`/events?search=${encodeURIComponent(q.trim())}`)">
            See all {{ totals.events }} actions in the activity log <v-icon icon="mdi-arrow-right" size="14" />
          </a>
        </div>
        <div class="hint">↑ ↓ to choose · Enter to open · Esc to close</div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.gsearch {
  position: relative;
  width: 100%;
  max-width: 520px;
}
.v-theme--light .gsearch-field :deep(.v-field) {
  background: #fff;
  box-shadow: inset 0 0 0 1px rgba(17, 24, 39, 0.1);
}
.panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 2000;
  max-height: 70vh;
  overflow: auto;
  padding: 8px;
  border-radius: 16px;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.18);
}
.section + .section {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.count {
  padding: 1px 8px;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  color: inherit;
  cursor: pointer;
  text-decoration: none;
}
.row:hover,
.row.sel {
  background: rgba(var(--v-theme-primary), 0.12);
}
.row-title {
  font-weight: 700;
  font-size: 0.9rem;
}
.row-sub {
  font-size: 0.78rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.row-meta {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
  white-space: nowrap;
}
.tag {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 0.68rem;
  font-weight: 800;
}
.tag.ok {
  color: #1d8a4a;
  background: rgba(46, 158, 91, 0.12);
}
.tag.bad {
  color: #c0392b;
  background: rgba(217, 68, 58, 0.12);
}
.empty {
  padding: 8px 10px;
  font-size: 0.85rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.more {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 0.82rem;
  font-weight: 700;
  color: rgb(var(--v-theme-primary));
  cursor: pointer;
}
.v-theme--light .more {
  color: #a87a00;
}
.more:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.hint {
  padding: 8px 10px 2px;
  font-size: 0.72rem;
  color: rgba(var(--v-theme-on-surface), 0.4);
}
.pop-enter-active,
.pop-leave-active {
  transition: opacity 0.12s, transform 0.12s;
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
