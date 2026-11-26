<script setup lang="ts">
/**
 * Clear cache — asks the agent on a server to clear one of a fixed list of
 * caches. Shows current sizes, the request history, and how much each run freed.
 * Every request and result is also written to Logs → Server logs.
 */
interface Action {
  key: string
  title: string
  description: string
  risk: 'low' | 'medium'
}
interface Agent {
  host: string
  lastSeenAt: string
  silent: boolean
  caches: Record<string, number | null>
  cachesAt: string | null
}
interface Task {
  id: number
  host: string
  action: string
  status: 'pending' | 'running' | 'done' | 'failed'
  requestedBy: string
  requestedAt: string
  startedAt: string | null
  finishedAt: string | null
  freedBytes: number | null
  output: string | null
}
interface Overview {
  configured: boolean
  actions: Action[]
  agents: Agent[]
  tasks: Task[]
}

const api = useApi()
const data = ref<Overview | null>(null)
const error = ref('')
const host = ref<string | null>(null)

async function load() {
  try {
    data.value = await api<Overview>('/server/caches')
    error.value = ''
    if (!host.value || !data.value.agents.some((a) => a.host === host.value))
      host.value = data.value.agents[0]?.host ?? null
  } catch (e) {
    error.value = errorMessage(e, 'Could not load')
  }
}
onMounted(load)

// Poll fast while something is waiting/running, slowly otherwise.
const busy = computed(() => data.value?.tasks.some((t) => t.status === 'pending' || t.status === 'running') ?? false)
let timer: ReturnType<typeof setTimeout> | undefined
function schedule() {
  clearTimeout(timer)
  timer = setTimeout(
    async () => {
      await load()
      schedule()
    },
    busy.value ? 2500 : 30_000,
  )
}
watch(busy, schedule, { immediate: true })
onBeforeUnmount(() => clearTimeout(timer))

const agent = computed(() => data.value?.agents.find((a) => a.host === host.value) ?? null)
const ICONS: Record<string, string> = {
  page_cache: 'mdi-memory',
  journal: 'mdi-notebook-outline',
  apt: 'mdi-package-down',
  tmp: 'mdi-folder-clock-outline',
  pm2_logs: 'mdi-text-box-remove-outline',
  nginx_cache: 'mdi-web-refresh',
}
const title = (key: string) => data.value?.actions.find((a) => a.key === key)?.title ?? key
const openTask = (key: string) =>
  data.value?.tasks.find(
    (t) => t.host === host.value && t.action === key && (t.status === 'pending' || t.status === 'running'),
  )
const lastDone = (key: string) =>
  data.value?.tasks.find(
    (t) => t.host === host.value && t.action === key && (t.status === 'done' || t.status === 'failed'),
  )
const totalCache = computed(() =>
  Object.values(agent.value?.caches ?? {}).reduce<number>((s, v) => s + (typeof v === 'number' ? v : 0), 0),
)

// ── confirm + request ──
const snack = reactive({ show: false, text: '', color: 'success' })
const toast = (text: string, color = 'success') => Object.assign(snack, { show: true, text, color })
const confirm = ref<Action | null>(null)
const sending = ref(false)
async function request() {
  if (!confirm.value || !host.value) return
  sending.value = true
  try {
    await api('/server/tasks', { method: 'POST', body: { host: host.value, action: confirm.value.key } })
    toast(`Sent to ${host.value} — waiting for the agent`)
    confirm.value = null
    await load()
  } catch (e) {
    toast(errorMessage(e, 'Could not send'), 'error')
  } finally {
    sending.value = false
  }
}

const STATUS: Record<Task['status'], { color: string; icon: string; label: string }> = {
  pending: { color: 'grey', icon: 'mdi-timer-sand', label: 'Waiting for agent' },
  running: { color: 'info', icon: 'mdi-progress-clock', label: 'Running' },
  done: { color: 'success', icon: 'mdi-check-circle', label: 'Done' },
  failed: { color: 'error', icon: 'mdi-alert-circle', label: 'Failed' },
}
const showOutput = ref<Task | null>(null)
const took = (t: Task) =>
  t.startedAt && t.finishedAt
    ? formatDuration((new Date(t.finishedAt).getTime() - new Date(t.startedAt).getTime()) / 1000)
    : '—'
</script>

<template>
  <div>
    <v-alert v-if="error" type="error" variant="tonal" rounded="lg" class="mb-4" :text="error" />

    <template v-if="data">
      <v-alert
        v-if="!data.configured"
        type="warning"
        variant="tonal"
        rounded="lg"
        class="mb-4"
        icon="mdi-server-off"
        title="Server agent not set up"
        text="Clearing caches needs the server agent (it runs as root on the server). Set SERVER_AGENT_KEY in the API settings and install it: deploy/server-agent/INSTALL.md."
      />
      <v-alert
        v-else-if="!data.agents.length"
        type="info"
        variant="tonal"
        rounded="lg"
        class="mb-4"
        icon="mdi-server-network"
        text="No server agent has reported yet. Install it on the server: deploy/server-agent/INSTALL.md."
      />

      <template v-if="agent">
        <!-- server + total -->
        <div class="head mb-5">
          <div class="head-ico" :class="{ bad: agent.silent }">
            <v-icon :icon="agent.silent ? 'mdi-server-off' : 'mdi-server'" size="24" />
          </div>
          <div class="min-w-0 flex-grow-1">
            <v-select
              v-if="data.agents.length > 1"
              v-model="host"
              :items="data.agents.map((a) => a.host)"
              density="compact"
              variant="outlined"
              hide-details
              style="max-width: 260px"
            />
            <div v-else class="text-h6 font-weight-bold">{{ agent.host }}</div>
            <div class="text-caption" :class="agent.silent ? 'text-error' : 'text-medium-emphasis'">
              {{
                agent.silent ? `Agent silent since ${timeAgo(agent.lastSeenAt)} — requests will wait` : 'Agent online'
              }}
              · sizes measured {{ agent.cachesAt ? timeAgo(agent.cachesAt) : 'not yet' }}
            </div>
          </div>
          <div class="total">
            <div class="text-caption text-medium-emphasis">Clearable now</div>
            <div class="total-val">{{ formatBytes(totalCache) }}</div>
          </div>
        </div>

        <!-- one card per cache -->
        <div class="caches mb-6">
          <section v-for="a in data.actions" :key="a.key" class="cache">
            <div class="d-flex align-center ga-3 mb-2">
              <div class="cache-ico"><v-icon :icon="ICONS[a.key] ?? 'mdi-broom'" size="22" /></div>
              <div class="min-w-0 flex-grow-1">
                <div class="font-weight-bold">{{ a.title }}</div>
                <v-chip :color="a.risk === 'low' ? 'success' : 'warning'" size="x-small" variant="tonal" label>{{
                  a.risk === 'low' ? 'Safe' : 'Deletes files'
                }}</v-chip>
              </div>
              <div class="text-right">
                <div class="size">
                  {{
                    agent.caches[a.key] === null || agent.caches[a.key] === undefined
                      ? '—'
                      : formatBytes(agent.caches[a.key])
                  }}
                </div>
                <div class="text-caption text-medium-emphasis">current size</div>
              </div>
            </div>
            <div class="text-body-2 text-medium-emphasis desc">{{ a.description }}</div>
            <div class="d-flex align-center ga-2 mt-3">
              <div class="text-caption text-medium-emphasis flex-grow-1 min-w-0">
                <template v-if="openTask(a.key)">
                  <v-icon :icon="STATUS[openTask(a.key)!.status].icon" size="14" />
                  {{ STATUS[openTask(a.key)!.status].label }}…
                </template>
                <template v-else-if="lastDone(a.key)">
                  Last: {{ timeAgo(lastDone(a.key)!.finishedAt) }} by {{ lastDone(a.key)!.requestedBy }}
                  <span v-if="lastDone(a.key)!.status === 'done' && lastDone(a.key)!.freedBytes !== null">
                    · freed {{ formatBytes(lastDone(a.key)!.freedBytes) }}</span
                  >
                  <span v-if="lastDone(a.key)!.status === 'failed'" class="text-error"> · failed</span>
                </template>
                <template v-else>Never cleared from here</template>
              </div>
              <v-btn
                color="primary"
                class="text-none text-black font-weight-bold"
                prepend-icon="mdi-broom"
                :loading="!!openTask(a.key)"
                :disabled="!!openTask(a.key)"
                @click="confirm = a"
                >Clear</v-btn
              >
            </div>
          </section>
        </div>
      </template>

      <!-- history -->
      <v-card class="bordered">
        <div class="d-flex align-center pa-4 pb-2">
          <div class="font-weight-bold">History</div>
          <v-spacer />
          <v-btn icon="mdi-refresh" variant="text" size="small" @click="load" />
        </div>
        <v-table density="comfortable">
          <thead>
            <tr>
              <th>Requested</th>
              <th>Server</th>
              <th>Cache</th>
              <th>By</th>
              <th>Status</th>
              <th class="text-right">Freed</th>
              <th class="text-right">Took</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-if="!data.tasks.length">
              <td colspan="8" class="text-center text-medium-emphasis py-6">Nothing cleared yet</td>
            </tr>
            <tr v-for="t in data.tasks" :key="t.id">
              <td class="text-caption">{{ formatDateTime(t.requestedAt) }}</td>
              <td>{{ t.host }}</td>
              <td class="font-weight-medium">{{ title(t.action) }}</td>
              <td>{{ t.requestedBy }}</td>
              <td>
                <v-chip
                  :color="STATUS[t.status].color"
                  size="small"
                  variant="tonal"
                  :prepend-icon="STATUS[t.status].icon"
                  >{{ STATUS[t.status].label }}</v-chip
                >
              </td>
              <td class="text-right">{{ t.freedBytes !== null ? formatBytes(t.freedBytes) : '—' }}</td>
              <td class="text-right text-caption">{{ took(t) }}</td>
              <td class="text-right">
                <v-btn v-if="t.output" size="small" variant="text" class="text-none" @click="showOutput = t"
                  >Output</v-btn
                >
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card>
    </template>
    <div v-else-if="!error" class="d-flex justify-center py-16">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <!-- confirm -->
    <v-dialog :model-value="!!confirm" max-width="460" @update:model-value="confirm = null">
      <v-card v-if="confirm" rounded="xl" class="pa-5">
        <div class="d-flex align-center ga-2 mb-2">
          <v-icon icon="mdi-broom" color="primary" />
          <span class="text-h6 font-weight-bold">Clear {{ confirm.title.toLowerCase() }}?</span>
        </div>
        <div class="text-body-2 mb-2">{{ confirm.description }}</div>
        <div class="text-body-2 text-medium-emphasis mb-4">
          Server <strong>{{ host }}</strong> · current size
          <strong>{{ formatBytes(agent?.caches[confirm.key] ?? null) }}</strong>. This is recorded in Server logs with
          your name.
        </div>
        <div class="d-flex justify-end ga-2">
          <v-btn variant="text" class="text-none" @click="confirm = null">Cancel</v-btn>
          <v-btn color="primary" class="text-none text-black font-weight-bold" :loading="sending" @click="request"
            >Clear now</v-btn
          >
        </div>
      </v-card>
    </v-dialog>

    <!-- output -->
    <v-dialog :model-value="!!showOutput" max-width="680" scrollable @update:model-value="showOutput = null">
      <v-card v-if="showOutput" rounded="xl">
        <v-card-title class="d-flex align-center pt-4">
          {{ title(showOutput.action) }} · {{ showOutput.host }}
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" @click="showOutput = null" />
        </v-card-title>
        <v-card-text>
          <pre class="out">{{ showOutput.output }}</pre>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" location="top" timeout="3000">{{ snack.text }}</v-snackbar>
  </div>
</template>

<style scoped>
.min-w-0 {
  min-width: 0;
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border-radius: 18px;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
.head-ico {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: #fff;
  background: linear-gradient(135deg, #1e9e6a, #137a50);
}
.head-ico.bad {
  background: linear-gradient(135deg, #d9443a, #a8281f);
}
.total {
  text-align: right;
}
.total-val {
  font-size: 1.5rem;
  font-weight: 800;
}
.caches {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
.cache {
  display: flex;
  flex-direction: column;
  padding: 18px 20px;
  border-radius: 18px;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
.cache-ico {
  width: 44px;
  height: 44px;
  border-radius: 13px;
  display: grid;
  place-items: center;
  color: #c47f00;
  background: rgba(255, 179, 0, 0.16);
  flex: none;
}
.size {
  font-weight: 800;
  font-size: 1.1rem;
}
.desc {
  flex-grow: 1;
}
.out {
  margin: 0;
  padding: 12px;
  border-radius: 10px;
  font-family: Menlo, Consolas, monospace;
  font-size: 0.78rem;
  white-space: pre-wrap;
  word-break: break-word;
  background: rgba(var(--v-theme-on-surface), 0.05);
}
</style>
