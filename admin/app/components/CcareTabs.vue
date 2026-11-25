<script setup lang="ts">
/** Shared header for the CCare section: one title with the section tabs. */
const { admin: me } = useAuth()
const canManage = computed(() => me.value?.role === 'admin' || me.value?.canManage === true)
const route = useRoute()
</script>

<template>
  <div class="mb-5">
    <h1 class="page-title">CCare</h1>
    <div class="text-body-2 text-medium-emphasis">Customer Care console</div>
    <v-tabs :model-value="route.path" color="primary" density="comfortable" class="mt-2">
      <v-tab value="/ccare-vas" to="/ccare-vas" class="text-none">
        <v-icon icon="mdi-cellphone-cog" size="18" class="mr-2" />
        Service
      </v-tab>
      <v-tab v-if="canManage" value="/ccare" to="/ccare" class="text-none">
        <v-icon icon="mdi-account-group-outline" size="18" class="mr-2" />
        Accounts
      </v-tab>
      <v-tab v-if="canManage" value="/ccare-logs" to="/ccare-logs" class="text-none">
        <v-icon icon="mdi-clipboard-text-clock-outline" size="18" class="mr-2" />
        Activity
      </v-tab>
    </v-tabs>
    <v-divider />
  </div>
</template>
