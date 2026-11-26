<script setup lang="ts">
/** Register E-SIM — Assign an eSIM IMSI to an ISDN. The form/table lives in components/tplus/TplusEsimRegister.vue (also shown on Vas Service). */
useHead({ title: 'Register E-SIM' })
</script>

<template>
  <div>
    <div class="mb-6">
      <h1 class="page-title">Register E-SIM</h1>
      <div class="text-body-2 text-medium-emphasis">Assign an eSIM IMSI to an ISDN</div>
    </div>

    <v-alert
      type="info"
      variant="tonal"
      density="compact"
      rounded="lg"
      class="mb-5"
      icon="mdi-information-outline"
      text="The IMSI and QR shown are example data. Each action is recorded in the CCare activity log; the telecom connection is wired later."
    />

    <v-card class="bordered pa-5" rounded="lg">
      <TplusEsimRegister />
    </v-card>
  </div>
</template>
