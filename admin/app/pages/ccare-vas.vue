<script setup lang="ts">
/**
 * Vas Service console — a tidy MyTPlus version of the My CCare operations page
 * (subscriber / SIM / package / serial actions). For now each request is only
 * recorded in the CCare activity log; the telecom connection is wired later.
 */
useHead({ title: 'Vas Service' })
const api = useApi()

const ACTION_OPTIONS = [
  'Check sim type',
  'Check Data',
  'Refill inform',
  'Register inform',
  'Check SIM OR IMSI',
  'Re_active SIM',
  'Re_active Lost SIM',
  'Add_MSISDN',
  'Delete_Pool_SIM',
  'Add MSIDN into IMSI',
  'Add Normal MSIDN',
  'Add Normal MSIDN Too',
]
const CODE_OPTIONS = [
  'Active MSISDN',
  'ON IR',
  'OF IR',
  'ON 5G',
  'ON 4G',
  'ON 3G',
  'ບໍລິການຝາກເບີ 6 ເດືອນ',
  'ບໍລິການຝາກເບີ 1 ປີ',
  'ຍົກເລີກການຝາກເບີ',
  'Change Status active to Idle',
  'Un_register_1grab',
  'Un_register_3grab',
  'Un_register_3grab v2',
  'UnBlock SIM not register',
  'UnBlock SIM not register too',
  'Check PostPaid Debit',
  'Re-Add package KYC',
  'Create Profile in SPNV',
  'Delete SPNV Profile',
  'Update CCare Password',
  'Allow MSISDN for CCare Can Add',
]
const PACKAGE_OPTIONS = [
  '101 (5,000k/5G/5Days)',
  '102 (10,000k/10G/10Days)',
  '103 (10,000k/5G/3Days)',
  '104 (10,000k/2G/7Days)',
  '105 (10,000k/500MB/30day)',
  '106 (50,000k/5G/30Day)',
  '107 (5,000k/2G Unlimit)',
  '108 (20,000k/5G Unlimit)',
  '109 (50,000k/10G Unlimit)',
  '110 (150,000k/30G Unlimit)',
  '112 (1,000k/2G/1h)',
  '113 (2,500k/4G/1Day)',
  '114 (15,000k/15G/7Day)',
  '115 (50,000k/30G/30Day)',
  '116 (5,000k/5G/3Day)',
  '117 (10,000k/10G/6Day)',
  '118 (20,000k/7G/7Day)',
  '119 (65,000k/25G/30Day)',
  '120 (20,000k/7G/5Day)',
  '121 (55,000k/20G/15Day)',
  '122 (100,000k/45G/30Day)',
  '123 (3,000k/4G Unlimit/1Day)',
  '150 (50,000k/40G/30Day)',
  '201 (5,000k/2G/1Day)',
  '202 (10,000k/3G/7Day)',
  '203 (50,000k/10G/30Day)',
  '204 (10,000k/5G/3Day)',
  '205 (150,000k/30G/30Day)',
  '206 (100,000k/30G/30Day)',
  '207 (10,000k/3G/5Day)',
  '208 (50,000k/15G/15Day)',
  '301 (10,000k/5G/3Day)',
  '302 (50,000l/5G/30Day)',
  '303 (5,000k/1G/Ulimit)',
  '304 (150,000k/Unlimit/30Day)',
  '111 (250,000k/60G/30Day)',
  '305 (250,000k/60G/30Day)',
  '306 (1,000k/2G/1h)',
  '307 (25,000k/4G/1Day)',
  '308 (15,000k/15G/7Day)',
  '309 (50,000k/30G/30Day)',
  '310 (20,000k/7G/7Day)',
  '311 (65,000k/25G/30DAY)',
  '312 (20,000k/7G/5Day)',
  '313 (55,000k/20G/15Day)',
  '314 (100,000k/45G/30Day)',
  '25 (25,000k/25G/7Day)',
  '350 (50,000k/40G/30Day)',
  'Free 5G/3Day',
]
const KYC_OPTIONS = ['Show KYC', 'Check KYC status', 'Re-Add package KYC']

const blank = {
  action: { msisdn: '', imsi: '', op: null as string | null },
  code: { msisdn: '', op: null as string | null },
  pkg: { msisdn: '', op: null as string | null },
  kyc: { msisdn: '', op: 'Show KYC' as string | null },
}
const forms = reactive(structuredClone(blank))

type Group = 'action' | 'code' | 'package' | 'kyc'
const groupKey = { action: 'action', code: 'code', package: 'pkg', kyc: 'kyc' } as const
function reset(group: Group) {
  Object.assign(forms[groupKey[group]], structuredClone(blank[groupKey[group]]))
}

const busy = ref<string | null>(null)
const result = ref<{ group: string; operation: string; message: string; at: string } | null>(null)
const snack = reactive({ show: false, text: '', color: 'success' })

async function run(group: Group) {
  let operation = ''
  let fields: Record<string, string> = {}
  if (group === 'action') {
    operation = forms.action.op ?? ''
    fields = { MSISDN: forms.action.msisdn.trim(), IMSI: forms.action.imsi.trim() }
    if (!operation) return toast('Choose an action', 'error')
    if (!fields.MSISDN && !fields.IMSI) return toast('Enter an MSISDN or IMSI', 'error')
  } else if (group === 'code') {
    operation = forms.code.op ?? ''
    fields = { MSISDN: forms.code.msisdn.trim() }
    if (!operation) return toast('Choose a code', 'error')
    if (!fields.MSISDN) return toast('Enter an MSISDN', 'error')
  } else if (group === 'package') {
    operation = forms.pkg.op ?? ''
    fields = { MSISDN: forms.pkg.msisdn.trim() }
    if (!operation) return toast('Choose a package', 'error')
    if (!fields.MSISDN) return toast('Enter an MSISDN', 'error')
  } else {
    operation = forms.kyc.op ?? ''
    fields = { MSISDN: forms.kyc.msisdn.trim() }
    if (!operation) return toast('Choose a KYC action', 'error')
    if (!fields.MSISDN) return toast('Enter an MSISDN', 'error')
  }

  busy.value = group
  try {
    const r = await api<{ message: string }>('/ccare/vas/submit', {
      method: 'POST',
      body: { group, operation, fields },
    })
    result.value = { group, operation, message: r.message, at: new Date().toISOString() }
    toast('Request recorded')
  } catch (e) {
    toast(errorMessage(e, 'Could not send the request'), 'error')
  } finally {
    busy.value = null
  }
}

function toast(text: string, color = 'success') {
  Object.assign(snack, { show: true, text, color })
}
</script>

<template>
  <div>
    <div class="d-flex flex-wrap align-center ga-3 mb-6">
      <div>
        <h1 class="page-title">Vas Service</h1>
        <div class="text-body-2 text-medium-emphasis">Customer Care operations console</div>
      </div>
    </div>

    <v-alert
      type="info"
      variant="tonal"
      density="compact"
      rounded="lg"
      class="mb-5"
      icon="mdi-information-outline"
      text="Every request here is recorded in the CCare activity log. The live telecom connection is not enabled yet, so actions are logged but not executed."
    />

    <div class="vas-grid">
      <!-- Subscriber / SIM -->
      <v-card class="bordered vas-card c-teal">
        <div class="vas-head">
          <div class="vas-ico tone-teal"><v-icon icon="mdi-sim-outline" /></div>
          <div>
            <div class="vas-title">Subscriber &amp; SIM</div>
            <div class="vas-sub">Look up and manage a SIM by MSISDN / IMSI</div>
          </div>
        </div>
        <v-text-field
          v-model="forms.action.msisdn"
          label="MSISDN"
          variant="outlined"
          density="comfortable"
          prepend-inner-icon="mdi-phone-outline"
        />
        <v-text-field
          v-model="forms.action.imsi"
          label="IMSI"
          variant="outlined"
          density="comfortable"
          prepend-inner-icon="mdi-identifier"
        />
        <v-select
          v-model="forms.action.op"
          :items="ACTION_OPTIONS"
          label="Action"
          variant="outlined"
          density="comfortable"
        />
        <div class="d-flex ga-2 vas-actions">
          <v-btn
            class="flex-grow-1 text-none text-black font-weight-bold"
            color="primary"
            :loading="busy === 'action'"
            prepend-icon="mdi-play"
            @click="run('action')"
            >Run</v-btn
          >
          <v-btn variant="tonal" class="text-none" prepend-icon="mdi-restore" @click="reset('action')">Reset</v-btn>
        </div>
      </v-card>

      <!-- Service codes -->
      <v-card class="bordered vas-card c-blue">
        <div class="vas-head">
          <div class="vas-ico tone-blue"><v-icon icon="mdi-cog-transfer-outline" /></div>
          <div>
            <div class="vas-title">Service codes</div>
            <div class="vas-sub">IR, 5G/4G/3G, deposits, KYC, SPNV…</div>
          </div>
        </div>
        <v-text-field
          v-model="forms.code.msisdn"
          label="MSISDN"
          variant="outlined"
          density="comfortable"
          prepend-inner-icon="mdi-phone-outline"
        />
        <v-select v-model="forms.code.op" :items="CODE_OPTIONS" label="Code" variant="outlined" density="comfortable" />
        <div class="d-flex ga-2 vas-actions">
          <v-btn
            class="flex-grow-1 text-none text-black font-weight-bold"
            color="primary"
            :loading="busy === 'code'"
            prepend-icon="mdi-play"
            @click="run('code')"
            >Run</v-btn
          >
          <v-btn variant="tonal" class="text-none" prepend-icon="mdi-restore" @click="reset('code')">Reset</v-btn>
        </div>
      </v-card>

      <!-- Package -->
      <v-card class="bordered vas-card c-amber">
        <div class="vas-head">
          <div class="vas-ico tone-amber"><v-icon icon="mdi-package-variant-closed" /></div>
          <div>
            <div class="vas-title">Package</div>
            <div class="vas-sub">Assign a data package</div>
          </div>
        </div>
        <v-text-field
          v-model="forms.pkg.msisdn"
          label="MSISDN"
          variant="outlined"
          density="comfortable"
          prepend-inner-icon="mdi-phone-outline"
        />
        <v-select
          v-model="forms.pkg.op"
          :items="PACKAGE_OPTIONS"
          label="Package"
          variant="outlined"
          density="comfortable"
        />
        <div class="d-flex ga-2 vas-actions">
          <v-btn
            class="flex-grow-1 text-none text-black font-weight-bold"
            color="primary"
            :loading="busy === 'package'"
            prepend-icon="mdi-play"
            @click="run('package')"
            >Run</v-btn
          >
          <v-btn variant="tonal" class="text-none" prepend-icon="mdi-restore" @click="reset('package')">Reset</v-btn>
        </div>
      </v-card>

      <!-- KYC -->
      <v-card class="bordered vas-card c-violet">
        <div class="vas-head">
          <div class="vas-ico tone-violet"><v-icon icon="mdi-card-account-details-outline" /></div>
          <div>
            <div class="vas-title">KYC</div>
            <div class="vas-sub">Show a subscriber's KYC</div>
          </div>
        </div>
        <v-text-field
          v-model="forms.kyc.msisdn"
          label="MSISDN"
          variant="outlined"
          density="comfortable"
          prepend-inner-icon="mdi-phone-outline"
        />
        <v-select v-model="forms.kyc.op" :items="KYC_OPTIONS" label="Action" variant="outlined" density="comfortable" />
        <div class="d-flex ga-2 vas-actions">
          <v-btn
            class="flex-grow-1 text-none text-black font-weight-bold"
            color="primary"
            :loading="busy === 'kyc'"
            prepend-icon="mdi-play"
            @click="run('kyc')"
            >Run</v-btn
          >
          <v-btn variant="tonal" class="text-none" prepend-icon="mdi-restore" @click="reset('kyc')">Reset</v-btn>
        </div>
      </v-card>
    </div>

    <!-- last result -->
    <v-expand-transition>
      <v-card v-if="result" class="bordered mt-5 pa-4">
        <div class="d-flex align-center ga-3">
          <v-icon icon="mdi-check-circle-outline" color="success" size="26" />
          <div>
            <div class="font-weight-bold">{{ result.operation }}</div>
            <div class="text-body-2 text-medium-emphasis">{{ result.message }}</div>
          </div>
          <v-spacer />
          <span class="text-caption text-medium-emphasis">{{ formatDateTime(result.at) }}</span>
        </div>
      </v-card>
    </v-expand-transition>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="2500" location="bottom">{{ snack.text }}</v-snackbar>
  </div>
</template>

<style scoped>
.vas-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}
@media (max-width: 760px) {
  .vas-grid {
    grid-template-columns: 1fr;
  }
}
.vas-card {
  position: relative;
  padding: 20px;
  overflow: hidden;
  border-radius: 18px;
  transition:
    transform 0.2s ease,
    box-shadow 0.22s ease,
    border-color 0.2s ease;
  animation: vas-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
}
/* a soft tinted wash in the top-right corner, coloured per card */
.vas-card::before {
  content: '';
  position: absolute;
  top: -40px;
  right: -40px;
  width: 140px;
  height: 140px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.06;
  pointer-events: none;
}
.vas-card.c-teal {
  color: #c47f00;
}
.vas-card.c-blue {
  color: #2f80ed;
}
.vas-card.c-amber {
  color: #e09a00;
}
.vas-card.c-violet {
  color: #7c4dc4;
}
.vas-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 18px 36px rgba(0, 0, 0, 0.1);
}
.vas-grid > .vas-card:nth-child(1) {
  animation-delay: 0.02s;
}
.vas-grid > .vas-card:nth-child(2) {
  animation-delay: 0.09s;
}
.vas-grid > .vas-card:nth-child(3) {
  animation-delay: 0.16s;
}
.vas-grid > .vas-card:nth-child(4) {
  animation-delay: 0.23s;
}
@keyframes vas-in {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.vas-actions {
  margin-top: 4px;
}
.vas-actions :deep(.v-btn) {
  transition:
    transform 0.16s ease,
    box-shadow 0.2s ease;
}
.vas-actions :deep(.v-btn:hover) {
  transform: translateY(-1px);
}
.vas-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.vas-ico {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.04);
}
@media (prefers-reduced-motion: reduce) {
  .vas-card {
    animation: none !important;
    transition: none !important;
  }
}
.vas-title {
  font-weight: 800;
  font-size: 1.05rem;
}
.vas-sub {
  font-size: 0.8rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.tone-teal {
  background: rgba(255, 179, 0, 0.18);
  color: #c47f00;
}
.tone-blue {
  background: rgba(47, 128, 237, 0.14);
  color: #2f80ed;
}
.tone-amber {
  background: rgba(237, 161, 0, 0.16);
  color: #e09a00;
}
.tone-violet {
  background: rgba(124, 77, 196, 0.16);
  color: #7c4dc4;
}
</style>
