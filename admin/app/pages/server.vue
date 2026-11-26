<script setup lang="ts">
/** Server — capacity of the machine running the API + website, and cache clearing. MyTPlus admins only. */
useHead({ title: 'Server' })
const { admin: me } = useAuth()
const route = useRoute()
if (me.value?.kind === 'ccare' || me.value?.role !== 'admin') await navigateTo('/', { replace: true })

type Tab = 'capacity' | 'cache'
const tab = computed<Tab>({
  get: () => (route.query.tab === 'cache' ? 'cache' : 'capacity'),
  set: (v) => navigateTo({ path: '/server', query: { tab: v } }, { replace: true }),
})
</script>

<template>
  <div>
    <div class="mb-4">
      <h1 class="page-title">Server</h1>
      <div class="text-body-2 text-medium-emphasis">
        Capacity of the server running the API and website, and cache clearing
      </div>
    </div>

    <v-tabs v-model="tab" color="primary" density="comfortable" class="mb-5">
      <v-tab value="capacity" class="text-none"><v-icon icon="mdi-gauge" size="18" class="mr-2" />Capacity</v-tab>
      <v-tab value="cache" class="text-none"><v-icon icon="mdi-broom" size="18" class="mr-2" />Clear cache</v-tab>
    </v-tabs>

    <ServerCapacity v-if="tab === 'capacity'" />
    <ServerCaches v-else />
  </div>
</template>
