<script setup lang="ts">
import { BRANDING_DEFAULTS as BRANDING_DEFAULTS_, type Branding } from '~/composables/useBranding'
interface Retention {
  enabled: boolean
  months: number
  monthOptions: number[]
  updatedAt?: string
  updatedBy?: string
  lastRun: { at: string; deleted: number; cutoff: string; months: number; by: string; ms: number } | null
  preview: { months: number; cutoff: string; willDelete: number }
  total: number
  oldest: string | null
}

const api = useApi()
const { admin: me } = useAuth()
const canEdit = computed(() => me.value?.role === 'admin')

const info = ref<Retention | null>(null)
const form = reactive({ enabled: true, months: 4 })
const loading = ref(true)
const saving = ref(false)
const running = ref(false)
const confirm = ref<'save' | 'run' | null>(null)
const error = ref('')
const snack = reactive({ show: false, text: '', color: 'success' })

function apply(r: Retention) {
  info.value = r
  form.enabled = r.enabled
  form.months = r.months
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    apply(await api<Retention>('/settings/retention'))
  } catch (e: any) {
    error.value = e?.data?.message || 'Could not load the settings'
  } finally {
    loading.value = false
  }
}
onMounted(load)

// Live count of what the selected period would delete.
const preview = ref<Retention['preview'] | null>(null)
watch(
  () => form.months,
  async (m) => {
    if (!info.value) return
    if (m === info.value.preview.months) return (preview.value = info.value.preview)
    try {
      preview.value = (await api<Retention>('/settings/retention', { query: { months: m } })).preview
    } catch {
      preview.value = null
    }
  },
)
const shown = computed(() => preview.value ?? info.value?.preview ?? null)
const changed = computed(() => !!info.value && (form.enabled !== info.value.enabled || form.months !== info.value.months))
const MONTH_ITEMS = computed(() =>
  (info.value?.monthOptions ?? [1, 2, 3, 4, 6, 12]).map((m) => ({
    value: m,
    title: m % 12 === 0 ? `${m / 12} year${m > 12 ? 's' : ''} (${m} months)` : `${m} month${m > 1 ? 's' : ''}`,
  })),
)
const keepText = computed(() => MONTH_ITEMS.value.find((i) => i.value === form.months)?.title ?? `${form.months} months`)

function askSave() {
  // Turning it on (or shortening the period) deletes logs right away, so confirm first.
  if (form.enabled && (shown.value?.willDelete ?? 0) > 0) confirm.value = 'save'
  else save()
}

async function save() {
  confirm.value = null
  saving.value = true
  try {
    const before = info.value?.total ?? 0
    apply(await api<Retention>('/settings/retention', { method: 'PUT', body: { enabled: form.enabled, months: form.months } }))
    preview.value = null
    const deleted = Math.max(0, before - (info.value?.total ?? 0))
    Object.assign(snack, { show: true, color: 'success', text: deleted ? `Saved. Deleted ${deleted.toLocaleString()} old logs` : 'Saved' })
  } catch (e: any) {
    Object.assign(snack, { show: true, color: 'error', text: e?.data?.message || 'Could not save' })
  } finally {
    saving.value = false
  }
}

async function runNow() {
  confirm.value = null
  running.value = true
  try {
    apply(await api<Retention>('/settings/retention/run', { method: 'POST' }))
    preview.value = null
    const n = info.value?.lastRun?.deleted ?? 0
    Object.assign(snack, { show: true, color: 'success', text: n ? `Deleted ${n.toLocaleString()} old logs` : 'Nothing to delete' })
  } catch (e: any) {
    Object.assign(snack, { show: true, color: 'error', text: e?.data?.message || 'Could not delete' })
  } finally {
    running.value = false
  }
}

// ── website logo ──
const { branding, load: loadBranding } = useBranding()
const defaultFavicon = DEFAULT_FAVICON
const BRANDING_DEFAULTS = BRANDING_DEFAULTS_
const logoDraft = ref<string | null | undefined>(undefined) // undefined = no change
const logoError = ref('')
const logoSaving = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const shownLogo = computed(() => (logoDraft.value === undefined ? branding.value.logo : logoDraft.value))
const names = reactive({ name: '', subtitle: '', title: '' })
const resetNames = () => Object.assign(names, { name: branding.value.name, subtitle: branding.value.subtitle, title: branding.value.title })
watch(() => [branding.value.name, branding.value.subtitle, branding.value.title], resetNames, { immediate: true })
const namesChanged = computed(
  () => names.name.trim() !== branding.value.name || names.subtitle.trim() !== branding.value.subtitle || names.title.trim() !== branding.value.title,
)
const logoChanged = computed(
  () => (logoDraft.value !== undefined && logoDraft.value !== branding.value.logo) || namesChanged.value,
)
const nameRules = {
  name: (v: string) => (!!v.trim() && v.trim().length <= 40) || '1–40 characters',
  subtitle: (v: string) => v.trim().length <= 60 || '60 characters max',
  title: (v: string) => (!!v.trim() && v.trim().length <= 80) || '1–80 characters',
}
function cancelBrand() {
  logoDraft.value = undefined
  resetNames()
}
function useDefaults() {
  logoDraft.value = null
  Object.assign(names, { name: BRANDING_DEFAULTS.name, subtitle: BRANDING_DEFAULTS.subtitle, title: BRANDING_DEFAULTS.title })
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

/** Fits the picture into a 256×256 square (keeps transparency), as PNG. */
async function toSquarePng(src: string) {
  const img = new Image()
  img.src = src
  await img.decode()
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight)
  const w = img.naturalWidth * scale
  const h = img.naturalHeight * scale
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
  return canvas.toDataURL('image/png')
}

async function pickLogo(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  logoError.value = ''
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) {
    logoError.value = 'Use a PNG, JPG, WEBP or SVG image'
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    logoError.value = 'The file is too big (max 5 MB)'
    return
  }
  try {
    const raw = await readAsDataUrl(file)
    const data = file.type === 'image/svg+xml' ? raw : await toSquarePng(raw)
    if (data.length > 700_000) {
      logoError.value = 'This SVG is too big (max about 500 KB)'
      return
    }
    logoDraft.value = data
  } catch {
    logoError.value = 'Could not read this image'
  }
}

async function saveLogo() {
  logoSaving.value = true
  logoError.value = ''
  try {
    for (const k of ['name', 'subtitle', 'title'] as const) {
      const ok = nameRules[k](names[k])
      if (ok !== true) throw { data: { message: `${k === 'title' ? 'Browser tab title' : k === 'name' ? 'Website name' : 'Subtitle'}: ${ok}` } }
    }
    const body: Record<string, unknown> = { name: names.name.trim(), subtitle: names.subtitle.trim(), title: names.title.trim() }
    if (logoDraft.value !== undefined) body.logo = logoDraft.value
    branding.value = { ...BRANDING_DEFAULTS, ...(await api<Branding>('/settings/branding', { method: 'PUT', body })) }
    logoDraft.value = undefined
    Object.assign(snack, { show: true, color: 'success', text: 'Saved: the sidebar, login page and browser tab are updated' })
  } catch (e: any) {
    logoError.value = e?.data?.message || 'Could not save'
  } finally {
    logoSaving.value = false
  }
}
onMounted(loadBranding)
</script>

<template>
  <div>
    <div class="mb-6">
      <h1 class="page-title">Settings</h1>
      <div class="text-body-2 text-medium-emphasis">Website name, logo and how long the logs are kept</div>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" rounded="lg" class="mb-4" :text="error" />
    <v-alert v-if="!canEdit" type="info" variant="tonal" rounded="lg" class="mb-4" icon="mdi-eye-outline">
      You can see these settings. Only administrators can change them.
    </v-alert>

    <v-card class="bordered mb-6">
      <div class="head">
        <div class="head-icon"><v-icon icon="mdi-image-outline" size="26" /></div>
        <div class="flex-grow-1">
          <div class="text-h6 font-weight-black">Website name &amp; logo</div>
          <div class="text-body-2 text-medium-emphasis">Shown in the sidebar, on the login page and in the browser tab</div>
        </div>
      </div>

      <v-divider />

      <v-card-text class="pa-5">
        <div class="logo-row">
          <!-- upload box -->
          <button type="button" class="drop" :disabled="!canEdit" @click="fileInput?.click()">
            <div class="drop-preview" :class="{ custom: shownLogo }">
              <img v-if="shownLogo" :src="shownLogo" alt="Logo preview" />
              <v-icon v-else icon="mdi-chart-timeline-variant" size="44" color="black" />
            </div>
            <div v-if="canEdit" class="drop-text">
              <v-icon icon="mdi-upload" size="18" /> {{ shownLogo ? 'Change logo' : 'Upload logo' }}
            </div>
          </button>
          <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden @change="pickLogo" />

          <!-- where it appears -->
          <div class="flex-grow-1" style="min-width: 0">
            <div class="name-grid mb-5">
              <v-text-field
                v-model="names.name"
                label="Website name"
                :rules="[nameRules.name]"
                :disabled="!canEdit"
                counter="40"
                prepend-inner-icon="mdi-format-title"
                density="comfortable"
              />
              <v-text-field
                v-model="names.subtitle"
                label="Subtitle (under the name)"
                :rules="[nameRules.subtitle]"
                :disabled="!canEdit"
                counter="60"
                prepend-inner-icon="mdi-text-short"
                density="comfortable"
              />
              <v-text-field
                v-model="names.title"
                label="Browser tab title"
                :rules="[nameRules.title]"
                :disabled="!canEdit"
                counter="80"
                prepend-inner-icon="mdi-tab"
                density="comfortable"
              />
            </div>
            <div class="label">Preview</div>
            <div class="previews">
              <div class="pv pv-tab">
                <div class="tab">
                  <span class="tab-icon"><img :src="shownLogo || defaultFavicon" alt="" /></span>
                  <span class="tab-title">{{ names.title || BRANDING_DEFAULTS.title }}</span>
                  <v-icon icon="mdi-close" size="14" class="ml-auto" />
                </div>
                <div class="pv-cap">Browser tab</div>
              </div>
              <div class="pv pv-side">
                <div class="side">
                  <span class="side-logo" :class="{ custom: shownLogo }">
                    <img v-if="shownLogo" :src="shownLogo" alt="" />
                    <v-icon v-else icon="mdi-chart-timeline-variant" size="20" color="black" />
                  </span>
                  <span>
                    <span class="side-name">{{ names.name || BRANDING_DEFAULTS.name }}</span>
                    <span v-if="names.subtitle" class="side-sub">{{ names.subtitle }}</span>
                  </span>
                </div>
                <div class="pv-cap">Sidebar</div>
              </div>
            </div>
            <div class="text-caption text-medium-emphasis mt-3">
              PNG, JPG, WEBP or SVG. A square picture looks best; others are fitted into a square automatically.
            </div>
            <v-alert v-if="logoError" type="error" variant="tonal" density="compact" rounded="lg" class="mt-3" :text="logoError" />
            <div v-if="branding.updatedBy" class="text-caption text-medium-emphasis mt-2">
              Last changed by {{ branding.updatedBy }} {{ timeAgo(branding.updatedAt) }}
            </div>
          </div>
        </div>
      </v-card-text>

      <template v-if="canEdit">
        <v-divider />
        <v-card-actions class="pa-4 ga-3 flex-wrap">
          <v-btn
            variant="text"
            color="error"
            class="text-none"
            prepend-icon="mdi-restore"
            :disabled="logoSaving"
            @click="useDefaults"
          >
            Use defaults
          </v-btn>
          <v-spacer />
          <v-btn variant="text" class="text-none" :disabled="!logoChanged || logoSaving" @click="cancelBrand">Cancel</v-btn>
          <v-btn color="primary" variant="flat" class="text-none px-6" prepend-icon="mdi-content-save-outline" :loading="logoSaving" :disabled="!logoChanged" @click="saveLogo">
            Save
          </v-btn>
        </v-card-actions>
      </template>
    </v-card>

    <v-card class="bordered" :loading="loading">
      <div class="head">
        <div class="head-icon"><v-icon icon="mdi-delete-clock-outline" size="26" /></div>
        <div class="flex-grow-1">
          <div class="text-h6 font-weight-black">Auto delete old logs</div>
          <div class="text-body-2 text-medium-emphasis">Logs older than the chosen period are deleted automatically every hour</div>
        </div>
        <v-switch v-model="form.enabled" :disabled="!canEdit || loading" color="success" inset hide-details :label="form.enabled ? 'On' : 'Off'" />
      </div>

      <v-divider />

      <v-card-text class="pa-5">
        <v-row>
          <v-col cols="12" md="5">
            <div class="label">Keep logs for</div>
            <v-select
              v-model="form.months"
              :items="MONTH_ITEMS"
              :disabled="!canEdit || loading || !form.enabled"
              prepend-inner-icon="mdi-calendar-range"
              hide-details
              density="comfortable"
            />
            <div class="text-caption text-medium-emphasis mt-2">
              <template v-if="form.enabled">Every log older than {{ keepText }} is deleted for good. It cannot be brought back.</template>
              <template v-else>Auto delete is off: all logs are kept forever.</template>
            </div>
          </v-col>

          <v-col cols="12" md="7">
            <div class="facts">
              <div class="fact">
                <div class="fact-label">Logs stored now</div>
                <div class="fact-value">{{ (info?.total ?? 0).toLocaleString() }}</div>
                <div class="fact-sub">Oldest: {{ info?.oldest ? formatDateTime(info.oldest) : '—' }}</div>
              </div>
              <div class="fact" :class="{ warn: form.enabled && (shown?.willDelete ?? 0) > 0 }">
                <div class="fact-label">Older than {{ keepText }}</div>
                <div class="fact-value">{{ (shown?.willDelete ?? 0).toLocaleString() }}</div>
                <div class="fact-sub">Before {{ shown ? formatDateTime(shown.cutoff) : '—' }}</div>
              </div>
            </div>
          </v-col>
        </v-row>

        <div class="last-run mt-5">
          <v-icon icon="mdi-history" size="18" />
          <span v-if="info?.lastRun">
            Last clean-up {{ timeAgo(info.lastRun.at) }} ({{ formatDateTime(info.lastRun.at) }}):
            <strong>{{ info.lastRun.deleted.toLocaleString() }}</strong> logs deleted, older than {{ info.lastRun.months }} months
            <span class="text-medium-emphasis">· by {{ info.lastRun.by }}</span>
            <span v-if="info?.updatedBy" class="text-medium-emphasis"> · setting changed by {{ info.updatedBy }} {{ timeAgo(info.updatedAt) }}</span>
          </span>
          <span v-else>No clean-up has run yet</span>
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions v-if="canEdit" class="pa-4 ga-3 flex-wrap">
        <v-btn
          variant="tonal"
          color="error"
          class="text-none"
          prepend-icon="mdi-delete-sweep-outline"
          :loading="running"
          :disabled="loading || saving || changed"
          @click="confirm = 'run'"
        >
          Delete old logs now
        </v-btn>
        <span v-if="changed" class="text-caption text-medium-emphasis">Save first to delete with the new period</span>
        <v-spacer />
        <v-btn variant="text" class="text-none" :disabled="!changed || saving" @click="info && apply(info)">Cancel</v-btn>
        <v-btn color="primary" variant="flat" class="text-none px-6" prepend-icon="mdi-content-save-outline" :loading="saving" :disabled="!changed" @click="askSave">
          Save
        </v-btn>
      </v-card-actions>
    </v-card>

    <v-dialog :model-value="!!confirm" max-width="440" @update:model-value="(v) => !v && (confirm = null)">
      <v-card class="pa-2">
        <v-card-title class="d-flex align-center ga-2 font-weight-black">
          <v-icon icon="mdi-alert-circle-outline" color="error" /> Delete old logs?
        </v-card-title>
        <v-card-text>
          <strong>{{ (shown?.willDelete ?? 0).toLocaleString() }}</strong> logs older than {{ keepText }}
          (before {{ shown ? formatDateTime(shown.cutoff) : '' }}) will be deleted for good. This cannot be undone.
          <div class="mt-2 text-medium-emphasis">Tip: export them on the Reports page first if you need a copy.</div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" class="text-none" @click="confirm = null">Cancel</v-btn>
          <v-btn color="error" variant="flat" class="text-none" @click="confirm === 'run' ? runNow() : save()">
            {{ confirm === 'run' ? 'Delete now' : 'Save and delete' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="3500" location="bottom right">{{ snack.text }}</v-snackbar>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
}
.head-icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: #8a5a00;
  background: rgba(252, 208, 33, 0.25);
}
.v-theme--dark .head-icon {
  color: #fcd021;
  background: rgba(252, 208, 33, 0.14);
}
.label {
  font-size: 0.8rem;
  font-weight: 800;
  margin-bottom: 8px;
}
.facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}
.fact {
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.fact.warn {
  background: rgba(192, 57, 43, 0.08);
}
.fact.warn .fact-value {
  color: #c0392b;
}
.fact-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.fact-value {
  font-size: 1.6rem;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}
.fact-sub {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.last-run {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 0.85rem;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.logo-row {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: flex-start;
}
.drop {
  width: 180px;
  padding: 18px;
  border-radius: 18px;
  border: 2px dashed rgba(var(--v-theme-on-surface), 0.18);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.drop:not(:disabled):hover {
  border-color: #fcd021;
  background: rgba(252, 208, 33, 0.08);
}
.drop:disabled {
  cursor: default;
}
.drop-preview {
  width: 112px;
  height: 112px;
  border-radius: 26px;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: linear-gradient(135deg, #fcd021, #ffb300);
  box-shadow: 0 8px 22px rgba(252, 208, 33, 0.3);
}
.drop-preview.custom,
.side-logo.custom {
  background: #fff;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
}
.drop-preview img,
.side-logo img,
.tab-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.drop-text {
  font-size: 0.85rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 6px;
}
.previews {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.pv-cap {
  font-size: 0.72rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.55);
  margin-top: 6px;
}
.tab {
  width: 240px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 10px 10px 0 0;
  background: rgba(var(--v-theme-on-surface), 0.06);
  box-shadow: inset 0 -2px 0 rgba(var(--v-theme-on-surface), 0.1);
  font-size: 0.8rem;
}
.tab-icon {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  overflow: hidden;
  flex-shrink: 0;
}
.tab-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.side {
  width: 220px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #16161a;
  color: #fff;
}
.side-logo {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  overflow: hidden;
  flex-shrink: 0;
  background: linear-gradient(135deg, #fcd021, #ffb300);
}
.side-name {
  display: block;
  font-weight: 800;
  font-size: 0.95rem;
}
.side-sub {
  display: block;
  font-size: 0.72rem;
  opacity: 0.6;
}
.name-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 4px 12px;
}
.tab-title,
.side-name,
.side-sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
