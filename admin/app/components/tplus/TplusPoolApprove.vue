<script setup lang="ts">
/**
 * Approve Add / Delete Number — ported from the legacy allowpoolnumber.php.
 * Lists pool numbers awaiting approval (example data) with prepaid/postpaid
 * price; each approve is written to the CCare activity log.
 */
const api = useApi()

type Row = { id: number; msisdn: string; prepaidPrice: number; postpaidPrice: number }

const PRICE_TYPES = ['prepaid', 'postpaid']
const priceType = ref<string | null>(null)
const search = ref('')
const rows = ref<Row[]>([])
const loading = ref(false)
const approving = ref<string | null>(null)
const done = reactive<Record<string, boolean>>({})
const snack = reactive({ show: false, text: '', color: 'success' })
const toast = (text: string, color = 'success') => Object.assign(snack, { show: true, text, color })

async function load() {
  loading.value = true
  try {
    const r = await api<{ rows: Row[] }>('/ccare/tplus/pool', {
      query: { type: priceType.value || undefined, search: search.value.trim() || undefined },
    })
    rows.value = r.rows
  } catch (e) {
    toast(errorMessage(e, 'Could not load numbers'), 'error')
  } finally {
    loading.value = false
  }
}

async function approve(row: Row) {
  approving.value = row.msisdn
  try {
    await api('/ccare/tplus/pool/approve', {
      method: 'POST',
      body: { msisdn: row.msisdn, priceType: priceType.value || undefined },
    })
    done[row.msisdn] = true
    toast(`Approved ${row.msisdn}`)
  } catch (e) {
    toast(errorMessage(e, 'Could not approve'), 'error')
  } finally {
    approving.value = null
  }
}

const fmtPrice = (n: number) => n.toLocaleString('en-US')

let t: ReturnType<typeof setTimeout>
watch([search, priceType], () => {
  clearTimeout(t)
  t = setTimeout(load, 300)
})
onMounted(load)
</script>

<template>
  <div>
    <div class="filter-grid">
      <div>
        <div class="tp-label">Select Price Type</div>
        <v-select
          v-model="priceType"
          :items="PRICE_TYPES"
          placeholder="Select Type"
          variant="outlined"
          density="comfortable"
          clearable
        />
      </div>
      <div>
        <div class="tp-label">Search MSISDN</div>
        <v-text-field
          v-model="search"
          placeholder="Enter number..."
          variant="outlined"
          density="comfortable"
          prepend-inner-icon="mdi-magnify"
          clearable
        />
      </div>
    </div>

    <v-table class="mt-2">
      <thead>
        <tr>
          <th>MSISDN</th>
          <th class="text-right">Prepaid Price</th>
          <th class="text-right">Postpaid Price</th>
          <th class="text-right">Action</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading">
          <td colspan="4" class="text-center py-8"><v-progress-circular indeterminate color="primary" /></td>
        </tr>
        <tr v-else-if="!rows.length">
          <td colspan="4" class="text-center py-8 text-medium-emphasis">No numbers found</td>
        </tr>
        <tr v-for="row in rows" :key="row.id">
          <td class="font-weight-bold">{{ row.msisdn }}</td>
          <td class="text-right">{{ fmtPrice(row.prepaidPrice) }}</td>
          <td class="text-right">{{ fmtPrice(row.postpaidPrice) }}</td>
          <td class="text-right">
            <v-btn
              size="small"
              color="success"
              class="text-none"
              :loading="approving === row.msisdn"
              :disabled="done[row.msisdn]"
              @click="approve(row)"
              >{{ done[row.msisdn] ? 'Approved' : 'Approve' }}</v-btn
            >
          </td>
        </tr>
      </tbody>
    </v-table>

    <v-snackbar v-model="snack.show" :color="snack.color" location="top" timeout="2500">{{ snack.text }}</v-snackbar>
  </div>
</template>

<style scoped>
.filter-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}
.tp-label {
  font-weight: 700;
  font-size: 0.95rem;
  margin-bottom: 6px;
}
@media (max-width: 760px) {
  .filter-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
</style>
