<script setup lang="ts">
/** Confirm Nice Number — Approve booked premium numbers. The form/table lives in components/tplus/TplusNiceConfirm.vue (also shown on Vas Service). */
useHead({ title: 'Confirm Nice Number' })
</script>

<template>
  <div>
    <div class="mb-6">
      <h1 class="page-title">Confirm Nice Number</h1>
      <div class="text-body-2 text-medium-emphasis">Approve booked premium numbers</div>
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
      <TplusNiceConfirm />
    </v-card>
  </div>
</template>
