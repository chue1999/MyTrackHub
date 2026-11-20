<script setup lang="ts">
import { useDisplay, useTheme } from 'vuetify'

const { admin, logout } = useAuth()
const live = useLive()
const api = useApi()
onMounted(async () => {
  live.connect()
  // Refresh name/role (e.g. after an administrator changed this account).
  try {
    const me = await api<{ id: number; username: string; displayName: string | null; role: 'admin' | 'viewer' }>('/auth/me')
    admin.value = { id: me.id, username: me.username, displayName: me.displayName, role: me.role }
  } catch {}
})
const { mdAndUp } = useDisplay()
const theme = useTheme()
const drawer = ref<boolean | null>(null)
const pwDialog = ref(false)

const nav = computed(() => [
  { title: 'Dashboard', icon: 'mdi-view-dashboard-outline', to: '/' },
  { title: 'Users', icon: 'mdi-account-group-outline', to: '/users' },
  { title: 'Activity log', icon: 'mdi-timeline-text-outline', to: '/events' },
  ...(admin.value?.role === 'admin'
    ? [{ title: 'Admin accounts', icon: 'mdi-shield-account-outline', to: '/accounts' }]
    : []),
])

const isDark = computed(() => theme.global.current.value.dark)
function toggleTheme() {
  theme.global.name.value = isDark.value ? 'light' : 'dark'
}
</script>

<template>
  <v-navigation-drawer v-model="drawer" :permanent="mdAndUp" width="248">
    <div class="d-flex align-center ga-3 pa-4">
      <v-avatar color="primary" rounded="lg" size="40">
        <v-icon icon="mdi-chart-timeline-variant" color="black" />
      </v-avatar>
      <div>
        <div class="text-subtitle-1 font-weight-bold">MyTPlus</div>
        <div class="text-caption text-medium-emphasis">User activity</div>
      </div>
    </div>
    <v-divider />
    <v-list nav density="comfortable" color="primary" class="mt-2">
      <v-list-item
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        :prepend-icon="item.icon"
        :title="item.title"
        :exact="item.to === '/'"
        rounded="lg"
      />
    </v-list>
  </v-navigation-drawer>

  <v-app-bar flat border="b" density="comfortable">
    <v-app-bar-nav-icon v-if="!mdAndUp" @click="drawer = !drawer" />
    <v-spacer />
    <v-chip
      :color="live.connected.value ? 'success' : 'grey'"
      variant="tonal"
      size="small"
      class="mr-2"
      :title="live.connected.value ? 'Updates appear instantly' : 'Reconnecting…'"
    >
      <v-icon
        icon="mdi-circle"
        size="10"
        start
        :class="{ 'live-dot': live.connected.value }"
      />
      {{ live.connected.value ? 'Live' : 'Offline' }}
    </v-chip>
    <v-btn :icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'" variant="text" @click="toggleTheme" />
    <v-menu>
      <template #activator="{ props }">
        <v-btn v-bind="props" variant="text" class="text-none" prepend-icon="mdi-account-circle-outline">
          {{ admin?.displayName || admin?.username }}
        </v-btn>
      </template>
      <v-list density="compact">
        <v-list-item
          :subtitle="admin?.role === 'admin' ? 'Administrator' : 'Viewer'"
          :title="admin?.username"
          prepend-icon="mdi-account-circle-outline"
        />
        <v-divider />
        <v-list-item prepend-icon="mdi-lock-reset" title="Change password" @click="pwDialog = true" />
        <v-list-item prepend-icon="mdi-logout" title="Log out" @click="logout" />
      </v-list>
    </v-menu>
  </v-app-bar>

  <ChangePasswordDialog v-model="pwDialog" />

  <v-main>
    <v-container fluid class="pa-4 pa-md-6" style="max-width: 1400px">
      <slot />
    </v-container>
  </v-main>
</template>

<style scoped>
.live-dot {
  animation: live-pulse 1.6s ease-in-out infinite;
}
@keyframes live-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>
