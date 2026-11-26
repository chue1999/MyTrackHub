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

// The four console cards share one layout; only their fields and colour differ.
const CARDS = [
  {
    group: 'action' as Group,
    form: 'action' as const,
    title: 'Subscriber & SIM',
    sub: 'Look up and manage a SIM by MSISDN / IMSI',
    icon: 'mdi-sim-outline',
    accent: '#d99a00',
    imsi: true,
    selectLabel: 'Action',
    options: ACTION_OPTIONS,
  },
  {
    group: 'code' as Group,
    form: 'code' as const,
    title: 'Service codes',
    sub: 'IR, 5G/4G/3G, deposits, KYC, SPNV…',
    icon: 'mdi-cog-transfer-outline',
    accent: '#2f80ed',
    imsi: false,
    selectLabel: 'Code',
    options: CODE_OPTIONS,
  },
  {
    group: 'package' as Group,
    form: 'pkg' as const,
    title: 'Package',
    sub: 'Assign a data package',
    icon: 'mdi-package-variant-closed',
    accent: '#12a594',
    imsi: false,
    selectLabel: 'Package',
    options: PACKAGE_OPTIONS,
  },
  {
    group: 'kyc' as Group,
    form: 'kyc' as const,
    title: 'KYC',
    sub: "Show a subscriber's KYC",
    icon: 'mdi-card-account-details-outline',
    accent: '#7c4dc4',
    imsi: false,
    selectLabel: 'Action',
    options: KYC_OPTIONS,
  },
]

function toast(text: string, color = 'success') {
  Object.assign(snack, { show: true, text, color })
}
</script>

<template>
  <div>
    <div class="vas-hero mb-5">
      <div class="vas-hero-ico"><v-icon icon="mdi-cellphone-cog" size="26" /></div>
      <div class="flex-grow-1">
        <h1 class="page-title">Vas Service</h1>
        <div class="text-body-2 text-medium-emphasis">Customer Care operations console</div>
      </div>
      <div class="vas-note">
        <v-icon icon="mdi-information-outline" size="18" />
        <span>Requests are logged in CCare activity. The live telecom connection is not enabled yet.</span>
      </div>
    </div>

    <div class="vas-grid">
      <section v-for="(c, i) in CARDS" :key="c.group" class="vas-card" :style="{ '--accent': c.accent, '--i': i }">
        <header class="vas-head">
          <div class="vas-ico"><v-icon :icon="c.icon" size="22" /></div>
          <div class="min-w-0">
            <div class="vas-title">{{ c.title }}</div>
            <div class="vas-sub">{{ c.sub }}</div>
          </div>
        </header>

        <div class="vas-fields">
          <v-text-field
            v-model="forms[c.form].msisdn"
            label="MSISDN"
            placeholder="020…"
            variant="outlined"
            density="comfortable"
            :color="c.accent"
            prepend-inner-icon="mdi-phone-outline"
            hide-details
            @keyup.enter="run(c.group)"
          />
          <v-text-field
            v-if="c.imsi"
            v-model="forms.action.imsi"
            label="IMSI"
            variant="outlined"
            density="comfortable"
            :color="c.accent"
            prepend-inner-icon="mdi-identifier"
            hide-details
            @keyup.enter="run(c.group)"
          />
          <v-autocomplete
            v-model="forms[c.form].op"
            :items="c.options"
            :label="c.selectLabel"
            variant="outlined"
            density="comfortable"
            :color="c.accent"
            prepend-inner-icon="mdi-format-list-bulleted"
            hide-details
          />
        </div>

        <div class="vas-actions">
          <v-btn
            color="primary"
            variant="flat"
            height="44"
            class="text-none text-black font-weight-bold"
            :loading="busy === c.group"
            prepend-icon="mdi-play"
            @click="run(c.group)"
            >Run</v-btn
          >
          <v-btn
            variant="outlined"
            height="44"
            class="text-none font-weight-medium vas-reset"
            prepend-icon="mdi-restore"
            @click="reset(c.group)"
            >Reset</v-btn
          >
        </div>
      </section>
    </div>

    <!-- last result -->
    <v-expand-transition>
      <div v-if="result" class="vas-result mt-5">
        <v-icon icon="mdi-check-circle" color="success" size="26" />
        <div class="min-w-0 flex-grow-1">
          <div class="font-weight-bold">{{ result.operation }}</div>
          <div class="text-body-2 text-medium-emphasis">{{ result.message }}</div>
        </div>
        <span class="text-caption text-medium-emphasis">{{ formatDateTime(result.at) }}</span>
      </div>
    </v-expand-transition>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="2500" location="bottom">{{ snack.text }}</v-snackbar>
  </div>
</template>

<style scoped>
/* ── header ── */
.vas-hero {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
}
.vas-hero-ico {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  color: #1a1a1a;
  background: linear-gradient(135deg, #ffd54a, #f2b400);
  box-shadow: 0 8px 20px rgba(242, 180, 0, 0.28);
}
.vas-note {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 999px;
  font-size: 0.8rem;
  color: #2f6fd6;
  background: rgba(47, 128, 237, 0.08);
  border: 1px solid rgba(47, 128, 237, 0.18);
}

/* ── cards ── */
.vas-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}
@media (max-width: 860px) {
  .vas-grid {
    grid-template-columns: 1fr;
  }
}
.vas-card {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 22px 22px 20px;
  border-radius: 20px;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
  overflow: hidden;
  transition:
    transform 0.2s ease,
    box-shadow 0.22s ease,
    border-color 0.2s ease;
  animation: vas-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--i) * 70ms);
}
/* accent strip along the top edge */
.vas-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 4px;
  background: var(--accent);
}
/* soft glow in the corner */
.vas-card::after {
  content: '';
  position: absolute;
  top: -70px;
  right: -70px;
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--accent) 14%, transparent), transparent);
  pointer-events: none;
}
.vas-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--accent) 35%, transparent);
  box-shadow: 0 14px 32px rgba(16, 24, 40, 0.08);
}
.vas-head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
}
.vas-ico {
  flex: none;
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 13%, transparent);
}
.vas-title {
  font-weight: 800;
  font-size: 1.08rem;
  line-height: 1.25;
  color: var(--accent);
}
.vas-sub {
  font-size: 0.82rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.min-w-0 {
  min-width: 0;
}
.vas-fields {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex-grow: 1; /* pushes the buttons to the bottom so rows line up */
}
/* Run and Reset: two equal columns */
.vas-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 20px;
}
.vas-actions :deep(.v-btn) {
  width: 100%;
  border-radius: 12px;
  letter-spacing: 0;
  transition:
    transform 0.16s ease,
    box-shadow 0.2s ease;
}
.vas-actions :deep(.v-btn:hover) {
  transform: translateY(-1px);
}
.vas-reset {
  color: rgba(var(--v-theme-on-surface), 0.75);
  border-color: rgba(var(--v-theme-on-surface), 0.18);
}

/* ── last result ── */
.vas-result {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-radius: 16px;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-success), 0.35);
  border-left-width: 4px;
}

@keyframes vas-in {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .vas-card {
    animation: none !important;
    transition: none !important;
  }
}
</style>
