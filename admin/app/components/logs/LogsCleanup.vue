<script setup lang="ts">
/**
 * "Delete old logs": removes the entries of one log that are older than N days.
 * Shows first how many would go; the delete itself is recorded in the CCare log
 * as an entry that can never be deleted (who, which log, how many).
 */
const props = defineProps<{ kind: 'mytplus' | 'ccare' | 'server'; label: string }>()
const emit = defineEmits<{ done: [removed: number] }>()

const api = useApi()
const { admin: me } = useAuth()
// CCare administrators use their own path (CCare accounts can only reach /ccare/…).
const path = computed(() => (me.value?.kind === 'ccare' ? '/ccare/logs-cleanup' : '/logs-cleanup'))

const DAYS = [1, 5, 7, 14, 30, 60, 90]
const open = ref(false)
const days = ref(30)
const count = ref<number | null>(null)
const cutoff = ref('')
const loading = ref(false)
const deleting = ref(false)
const error = ref('')
const confirmed = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  count.value = null
  confirmed.value = false
  try {
    const r = await api<{ count: number; cutoff: string }>(path.value, { query: { kind: props.kind, days: days.value } })
    count.value = r.count
    cutoff.value = r.cutoff
  } catch (e) {
    error.value = errorMessage(e, 'Could not count the entries.')
  } finally {
    loading.value = false
  }
}
watch(open, (v) => v && load())
watch(days, load)

async function run() {
  deleting.value = true
  error.value = ''
  try {
    const r = await api<{ removed: number }>(path.value, {
      method: 'DELETE',
      query: { kind: props.kind, days: days.value },
    })
    open.value = false
    emit('done', r.removed)
  } catch (e) {
    error.value = errorMessage(e, 'Could not delete the entries.')
  } finally {
    deleting.value = false
  }
}
const when = computed(() =>
  cutoff.value
    ? new Date(cutoff.value).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '',
)
</script>

<template>
  <v-btn
    color="error"
    variant="tonal"
    prepend-icon="mdi-delete-clock-outline"
    class="text-none"
    @click="open = true"
  >
    Delete old logs
  </v-btn>

  <v-dialog v-model="open" max-width="480">
    <v-card rounded="xl" class="pa-2">
      <v-card-title class="d-flex align-center ga-2">
        <v-icon icon="mdi-delete-clock-outline" color="error" />Delete old {{ label }}
      </v-card-title>
      <v-card-text>
        <div class="text-body-2 mb-2">Delete the entries <b>older than</b>:</div>
        <v-chip-group v-model="days" mandatory selected-class="text-error" column>
          <v-chip v-for="d in DAYS" :key="d" :value="d" variant="outlined" filter>
            {{ d }} day{{ d === 1 ? '' : 's' }}
          </v-chip>
        </v-chip-group>

        <v-sheet rounded="lg" class="cleanup-box mt-3 pa-4">
          <div v-if="loading" class="d-flex align-center ga-2">
            <v-progress-circular indeterminate size="18" width="2" />Counting…
          </div>
          <template v-else-if="count !== null">
            <div class="text-h5 font-weight-bold" :class="count ? 'text-error' : ''">
              {{ count.toLocaleString() }} {{ count === 1 ? 'entry' : 'entries' }}
            </div>
            <div class="text-body-2 text-medium-emphasis">
              from before <b>{{ when }}</b> will be deleted. The last {{ days }} day{{ days === 1 ? '' : 's' }} stay.
            </div>
            <div v-if="kind === 'ccare'" class="text-caption text-medium-emphasis mt-1">
              Records of deletes are always kept.
            </div>
          </template>
        </v-sheet>

        <v-checkbox
          v-if="count"
          v-model="confirmed"
          density="compact"
          hide-details
          class="mt-3"
          :label="`Yes, delete ${count.toLocaleString()} entries. This cannot be undone.`"
        />
        <div class="text-caption text-medium-emphasis mt-2">
          <v-icon icon="mdi-shield-check-outline" size="14" /> Who deleted what is recorded in the CCare log.
        </div>
        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-3" :text="error" />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" class="text-none" @click="open = false">Cancel</v-btn>
        <v-btn
          color="error"
          variant="flat"
          class="text-none"
          :loading="deleting"
          :disabled="!count || !confirmed"
          @click="run"
        >
          Delete
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.cleanup-box {
  background: rgba(var(--v-theme-error), 0.06);
  border: 1px solid rgba(var(--v-theme-error), 0.18);
}
</style>
