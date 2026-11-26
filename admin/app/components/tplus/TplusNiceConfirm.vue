<script setup lang="ts">
/**
 * Confirm Nice Number — ported from the legacy Confrimnicenumber.php. Lists
 * pending nice numbers (example data) and confirms one; each confirm is written
 * to the CCare activity log.
 */
const api = useApi()

type Row = {
  id: number
  customerName: string
  msisdn: string
  price: number
  buyType: string
  confirmDate: string | null
  bookingBy: string
}

const search = ref('')
const rows = ref<Row[]>([])
const loading = ref(false)
const confirming = ref<string | null>(null)
const snack = reactive({ show: false, text: '', color: 'success' })
const toast = (text: string, color = 'success') => Object.assign(snack, { show: true, text, color })

async function load() {
  loading.value = true
  try {
    const r = await api<{ rows: Row[] }>('/ccare/tplus/nice', { query: { search: search.value.trim() || undefined } })
    rows.value = r.rows
  } catch (e) {
    toast(errorMessage(e, 'Could not load numbers'), 'error')
  } finally {
    loading.value = false
  }
}

async function confirm(row: Row) {
  confirming.value = row.msisdn
  try {
    await api('/ccare/tplus/nice/confirm', { method: 'POST', body: { msisdn: row.msisdn } })
    row.confirmDate = new Date().toISOString()
    toast(`Confirmed ${row.msisdn}`)
  } catch (e) {
    toast(errorMessage(e, 'Could not confirm'), 'error')
  } finally {
    confirming.value = null
  }
}

const fmtPrice = (n: number) => n.toLocaleString('en-US')
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString() : '—')

let t: ReturnType<typeof setTimeout>
watch(search, () => {
  clearTimeout(t)
  t = setTimeout(load, 300)
})
onMounted(load)
</script>

<template>
  <div>
    <div class="tp-label">Search MSISDN</div>
    <v-text-field
      v-model="search"
      placeholder="Enter number..."
      variant="outlined"
      density="comfortable"
      prepend-inner-icon="mdi-magnify"
      clearable
      style="max-width: 420px"
    />

    <v-table class="mt-2">
      <thead>
        <tr>
          <th>Customer Name</th>
          <th>MSISDN</th>
          <th class="text-right">Price</th>
          <th>Buy Type</th>
          <th>Confirm Date</th>
          <th>Booking By</th>
          <th class="text-right">Action</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading">
          <td colspan="7" class="text-center py-8"><v-progress-circular indeterminate color="primary" /></td>
        </tr>
        <tr v-else-if="!rows.length">
          <td colspan="7" class="text-center py-8 text-medium-emphasis">No numbers found</td>
        </tr>
        <tr v-for="row in rows" :key="row.id">
          <td>{{ row.customerName }}</td>
          <td class="font-weight-bold">{{ row.msisdn }}</td>
          <td class="text-right">{{ fmtPrice(row.price) }}</td>
          <td>
            <v-chip size="small" :color="row.buyType === 'postpaid' ? 'indigo' : 'teal'" variant="tonal">{{
              row.buyType
            }}</v-chip>
          </td>
          <td>{{ fmtDate(row.confirmDate) }}</td>
          <td>{{ row.bookingBy }}</td>
          <td class="text-right">
            <v-btn
              size="small"
              color="success"
              class="text-none"
              :loading="confirming === row.msisdn"
              :disabled="!!row.confirmDate"
              @click="confirm(row)"
              >{{ row.confirmDate ? 'Confirmed' : 'Confirm' }}</v-btn
            >
          </td>
        </tr>
      </tbody>
    </v-table>

    <v-snackbar v-model="snack.show" :color="snack.color" location="top" timeout="2500">{{ snack.text }}</v-snackbar>
  </div>
</template>

<style scoped>
.tp-label {
  font-weight: 700;
  font-size: 0.95rem;
  margin-bottom: 6px;
}
</style>
