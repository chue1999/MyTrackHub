<script setup lang="ts">
/**
 * Logs — one page, one tab per log. A MyTPlus administrator sees both the
 * MyTPlus app log and the CCare log; a CCare administrator sees only the CCare
 * log. Everyone else (viewers, CCare staff) has no access.
 */
useHead({ title: 'Logs' })
const { admin: me } = useAuth()
const route = useRoute()

const isCcare = computed(() => me.value?.kind === 'ccare')
const showMytplus = computed(() => !isCcare.value && me.value?.role === 'admin')
const showCcare = computed(() => (isCcare.value ? me.value?.canManage === true : me.value?.role === 'admin'))

if (!showMytplus.value && !showCcare.value) await navigateTo(isCcare.value ? '/ccare-vas' : '/', { replace: true })

type Tab = 'mytplus' | 'ccare' | 'server'
const tabs = computed(() => [
  ...(showMytplus.value ? [{ value: 'mytplus' as Tab, title: 'MyTPlus logs', icon: 'mdi-timeline-text-outline' }] : []),
  ...(showCcare.value ? [{ value: 'ccare' as Tab, title: 'CCare logs', icon: 'mdi-headset' }] : []),
  // What happened on the server itself (SSH, sudo, deletes): MyTPlus admins only.
  ...(showMytplus.value ? [{ value: 'server' as Tab, title: 'Server logs', icon: 'mdi-server-security' }] : []),
])
// The open tab lives in the address (?tab=ccare) so links and refresh keep it.
const tab = computed<Tab>({
  get: () => {
    const q = route.query.tab as Tab
    return tabs.value.some((t) => t.value === q) ? q : (tabs.value[0]?.value ?? 'ccare')
  },
  set: (v) => navigateTo({ path: '/logs', query: { tab: v } }, { replace: true }),
})
</script>

<template>
  <div>
    <div class="mb-4">
      <h1 class="page-title">Logs</h1>
      <div class="text-body-2 text-medium-emphasis">
        {{ tabs.length > 1 ? 'App activity, CCare activity and server activity' : 'CCare activity' }}
      </div>
    </div>

    <v-tabs v-if="tabs.length > 1" v-model="tab" color="primary" density="comfortable" class="mb-4">
      <v-tab v-for="t in tabs" :key="t.value" :value="t.value" class="text-none">
        <v-icon :icon="t.icon" size="18" class="mr-2" />{{ t.title }}
      </v-tab>
    </v-tabs>

    <MytplusLogs v-if="tab === 'mytplus' && showMytplus" />
    <CcareLogs v-else-if="tab === 'ccare' && showCcare" />
    <ServerLogs v-else-if="tab === 'server' && showMytplus" />
  </div>
</template>
