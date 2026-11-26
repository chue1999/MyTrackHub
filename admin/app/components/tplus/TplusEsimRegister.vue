<script setup lang="ts">
/**
 * Register E-SIM — ported from the legacy PHP Register_E_sim.php. Enter an ISDN,
 * pick an action and submit; a free IMSI + QR is pulled from the pool (example
 * data for now). Each submit is written to the CCare activity log.
 */
const api = useApi()

const isdn = ref('')
const imsi = ref('')
const qr = ref('')
const actions = ref<string[]>([])
const action = ref<string | null>(null)
const loadingNext = ref(false)
const busy = ref(false)
const snack = reactive({ show: false, text: '', color: 'success' })
const toast = (text: string, color = 'success') => Object.assign(snack, { show: true, text, color })

// After a successful submit we show the QR big so the customer can scan it.
const qrDialog = ref(false)
const scan = reactive({ isdn: '', imsi: '', qr: '' })

async function loadNext() {
  loadingNext.value = true
  try {
    const r = await api<{ imsi: string; qr: string; actions: string[] }>('/ccare/tplus/esim/next')
    imsi.value = r.imsi
    qr.value = r.qr
    actions.value = r.actions
    if (!action.value) action.value = r.actions[0] ?? null
  } catch (e) {
    toast(errorMessage(e, 'Could not load a free IMSI'), 'error')
  } finally {
    loadingNext.value = false
  }
}

async function submit() {
  if (!isdn.value.trim()) return toast('Enter an ISDN', 'error')
  if (!imsi.value) return toast('No IMSI loaded', 'error')
  if (!action.value) return toast('Choose an action', 'error')
  busy.value = true
  try {
    await api('/ccare/tplus/esim/register', {
      method: 'POST',
      body: { isdn: isdn.value.trim(), imsi: imsi.value, action: action.value },
    })
    // Show the QR big so the customer can scan it to install the eSIM.
    Object.assign(scan, { isdn: isdn.value.trim(), imsi: imsi.value, qr: qr.value })
    qrDialog.value = true
  } catch (e) {
    toast(errorMessage(e, 'Could not register'), 'error')
  } finally {
    busy.value = false
  }
}

// Customer scanned it — clear the form and pull the next IMSI.
async function scanDone() {
  qrDialog.value = false
  isdn.value = ''
  await loadNext()
}

// Customer could not scan — just close, keep the same ISDN/IMSI to try again.
function scanCancel() {
  qrDialog.value = false
  toast('Cancelled — number kept', 'warning')
}

onMounted(loadNext)
</script>

<template>
  <div>
    <div class="reg-grid">
      <div>
        <div class="tp-label">ISDN</div>
        <v-text-field
          v-model="isdn"
          placeholder="207..."
          variant="outlined"
          density="comfortable"
          prepend-inner-icon="mdi-phone-outline"
        />

        <div class="tp-label mt-2">Action</div>
        <v-select
          v-model="action"
          :items="actions"
          placeholder="Select action"
          variant="outlined"
          density="comfortable"
        />

        <div class="d-flex ga-2 mt-3">
          <v-btn
            color="primary"
            class="text-none font-weight-bold"
            :loading="busy"
            prepend-icon="mdi-check"
            @click="submit"
            >Submit</v-btn
          >
          <v-btn variant="tonal" class="text-none" :loading="loadingNext" prepend-icon="mdi-refresh" @click="loadNext"
            >New IMSI</v-btn
          >
        </div>
      </div>

      <div>
        <div class="tp-label">IMSI &amp; QR Code</div>
        <v-text-field
          :model-value="imsi"
          readonly
          variant="outlined"
          density="comfortable"
          bg-color="grey-lighten-4"
          prepend-inner-icon="mdi-identifier"
        />
        <div class="d-flex justify-start mt-2">
          <QrPreview v-if="qr" :value="qr" :size="200" />
        </div>
      </div>
    </div>

    <!-- Big QR after submit: the customer scans this to install the eSIM. -->
    <v-dialog v-model="qrDialog" max-width="440" persistent>
      <v-card rounded="xl" class="qr-dialog">
        <div class="qr-dialog-head">
          <v-icon icon="mdi-qrcode-scan" size="22" class="mr-2" />
          Scan to install eSIM
        </div>
        <div class="qr-dialog-body">
          <QrPreview v-if="scan.qr" :value="scan.qr" :size="300" />
          <div class="qr-meta">
            <div>
              <span class="qr-k">ISDN</span> <span class="qr-v">{{ scan.isdn || '—' }}</span>
            </div>
            <div>
              <span class="qr-k">IMSI</span> <span class="qr-v">{{ scan.imsi }}</span>
            </div>
          </div>
          <div class="text-caption text-medium-emphasis mt-1">
            Ask the customer to scan with their phone camera. If it will not scan, press Cancel.
          </div>
        </div>
        <v-divider />
        <div class="qr-dialog-actions">
          <v-btn variant="text" class="text-none" prepend-icon="mdi-close" @click="scanCancel">Cancel</v-btn>
          <v-btn color="success" class="text-none font-weight-bold" prepend-icon="mdi-check" @click="scanDone"
            >Scanned — Done</v-btn
          >
        </div>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" location="top" timeout="2500">{{ snack.text }}</v-snackbar>
  </div>
</template>

<style scoped>
.reg-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
}
.tp-label {
  font-weight: 700;
  font-size: 0.95rem;
  margin-bottom: 6px;
}
@media (max-width: 760px) {
  .reg-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}
.qr-dialog-head {
  display: flex;
  align-items: center;
  font-weight: 800;
  font-size: 1.05rem;
  padding: 18px 20px 12px;
}
.qr-dialog-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 4px 20px 18px;
  text-align: center;
}
.qr-meta {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.9rem;
}
.qr-meta > div {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px dashed rgba(17, 24, 39, 0.12);
  padding-bottom: 4px;
}
.qr-k {
  color: rgba(17, 24, 39, 0.5);
  font-weight: 600;
}
.qr-v {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.qr-dialog-actions {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px;
}
</style>
