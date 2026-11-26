<script setup lang="ts">
/** Approve Add / Delete Number — Approve pool numbers for sale. The form/table lives in components/tplus/TplusPoolApprove.vue (also shown on Vas Service). */
useHead({ title: 'Approve Add / Delete Number' })
</script>

<template>
  <div>
    <div class="mb-6">
      <h1 class="page-title">Approve Add / Delete Number</h1>
      <div class="text-body-2 text-medium-emphasis">Approve pool numbers for sale</div>
    </div>

    <v-alert
      type="info"
      variant="tonal"
      density="compact"
      rounded="lg"
      class="mb-5"
      icon="mdi-information-outline"
      text="The list is example data. Each action is recorded in the CCare activity log; the telecom connection is wired later."
    />

    <v-card class="bordered pa-5" rounded="lg">
      <TplusPoolApprove />
    </v-card>
  </div>
</template>
