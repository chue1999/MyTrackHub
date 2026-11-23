<script setup lang="ts">
import { useDisplay, useTheme } from 'vuetify'
const { branding } = useBranding()

const { admin, logout } = useAuth()
const live = useLive()
const api = useApi()
const route = useRoute()
const { mdAndUp } = useDisplay()
const theme = useTheme()
const drawer = ref<boolean | null>(null)
const pwDialog = ref(false)
useIdleLogout()

// Remember light/dark per browser.
const themeCookie = useCookie<'light' | 'dark'>('admin_theme', { maxAge: 60 * 60 * 24 * 365, sameSite: 'strict' })
if (themeCookie.value) theme.global.name.value = themeCookie.value
const isDark = computed(() => theme.global.current.value.dark)
function toggleTheme() {
  theme.global.name.value = isDark.value ? 'light' : 'dark'
  themeCookie.value = theme.global.name.value as 'light' | 'dark'
}

onMounted(async () => {
  live.connect()
  // Refresh name/role (e.g. after an administrator changed this account).
  try {
    const me = await api<{ id: number; username: string; displayName: string | null; role: 'admin' | 'viewer' }>(
      '/auth/me',
    )
    admin.value = { id: me.id, username: me.username, displayName: me.displayName, role: me.role }
  } catch {
    // Offline or API down: keep the account info stored at login.
  }
})

const nav = computed(() => [
  { title: 'Dashboard', icon: 'mdi-view-dashboard-outline', activeIcon: 'mdi-view-dashboard', to: '/' },
  { title: 'Users', icon: 'mdi-account-group-outline', activeIcon: 'mdi-account-group', to: '/users' },
  { title: 'Activity log', icon: 'mdi-timeline-text-outline', activeIcon: 'mdi-timeline-text', to: '/events' },
  { title: 'App features', icon: 'mdi-apps', activeIcon: 'mdi-apps', to: '/features' },
  { title: 'Packages', icon: 'mdi-package-variant', activeIcon: 'mdi-package-variant-closed', to: '/packages' },
  { title: 'Reports', icon: 'mdi-file-chart-outline', activeIcon: 'mdi-file-chart', to: '/reports' },
])
const adminNav = computed(() => [
  { title: 'Settings', icon: 'mdi-cog-outline', activeIcon: 'mdi-cog', to: '/settings' },
  ...(admin.value?.role === 'admin'
    ? [
        {
          title: 'Admin accounts',
          icon: 'mdi-shield-account-outline',
          activeIcon: 'mdi-shield-account',
          to: '/accounts',
        },
        {
          title: 'SQL Query',
          icon: 'mdi-database-search-outline',
          activeIcon: 'mdi-database-search',
          to: '/sql',
        },
      ]
    : []),
])
const isActive = (to: string) => (to === '/' ? route.path === '/' : route.path.startsWith(to))

const displayName = computed(() => admin.value?.displayName || admin.value?.username || '')
</script>

<template>
  <v-layout class="app-shell">
    <v-navigation-drawer v-model="drawer" :permanent="mdAndUp" width="260" class="sidebar" theme="dark">
      <div class="brand">
        <div class="brand-logo" :class="{ custom: branding.logo }">
          <BrandMark size="24" />
        </div>
        <div style="min-width: 0">
          <div class="brand-name">{{ branding.name }}</div>
          <div v-if="branding.subtitle" class="brand-sub">{{ branding.subtitle }}</div>
        </div>
      </div>

      <div class="nav-label">Overview</div>
      <nav class="nav">
        <NuxtLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          :class="{ active: isActive(item.to) }"
        >
          <v-icon :icon="isActive(item.to) ? item.activeIcon : item.icon" size="20" />
          <span>{{ item.title }}</span>
        </NuxtLink>
      </nav>

      <template v-if="adminNav.length">
        <div class="nav-label">Settings</div>
        <nav class="nav">
          <NuxtLink
            v-for="item in adminNav"
            :key="item.to"
            :to="item.to"
            class="nav-item"
            :class="{ active: isActive(item.to) }"
          >
            <v-icon :icon="isActive(item.to) ? item.activeIcon : item.icon" size="20" />
            <span>{{ item.title }}</span>
          </NuxtLink>
        </nav>
      </template>

      <template #append>
        <div class="me">
          <v-avatar color="primary" size="38">
            <span class="font-weight-black text-black">{{ displayName[0]?.toUpperCase() }}</span>
          </v-avatar>
          <div class="flex-grow-1" style="min-width: 0">
            <div class="me-name text-truncate">{{ displayName }}</div>
            <div class="me-role">{{ admin?.role === 'admin' ? 'Administrator' : 'Viewer' }}</div>
          </div>
          <v-menu location="top end">
            <template #activator="{ props }">
              <v-btn v-bind="props" icon="mdi-dots-vertical" variant="text" size="small" />
            </template>
            <v-list density="compact" min-width="200">
              <v-list-item prepend-icon="mdi-lock-reset" title="Change password" @click="pwDialog = true" />
              <v-list-item prepend-icon="mdi-logout" title="Log out" base-color="error" @click="logout()" />
            </v-list>
          </v-menu>
        </div>
      </template>
    </v-navigation-drawer>

    <v-app-bar flat class="topbar" height="68">
      <v-app-bar-nav-icon v-if="!mdAndUp" @click="drawer = !drawer" />
      <div class="mx-2 mx-md-6 flex-grow-1" style="max-width: 520px"><GlobalSearch /></div>
      <v-spacer />
      <div
        class="live-pill"
        :class="live.connected.value ? 'on' : 'off'"
        :title="live.connected.value ? 'Updates appear instantly' : 'Reconnecting…'"
      >
        <span class="dot" />
        {{ live.connected.value ? 'Live' : 'Offline' }}
      </div>
      <v-btn
        :icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'"
        variant="text"
        class="mx-1"
        :title="isDark ? 'Light mode' : 'Dark mode'"
        @click="toggleTheme"
      />
    </v-app-bar>

    <ChangePasswordDialog v-model="pwDialog" />

    <v-main class="main-scroll">
      <v-container fluid class="pa-4 pa-md-6" style="max-width: 1440px">
        <slot />
      </v-container>
    </v-main>
  </v-layout>
</template>

<style scoped>
/* ── shell: sidebar and top bar stay put; only the page content scrolls ── */
.app-shell {
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
}
.main-scroll {
  height: 100%;
  overflow-y: auto;
}

/* ── sidebar (always dark) ── */
.sidebar {
  background: linear-gradient(180deg, #17171a 0%, #101012 100%) !important;
  border-right: none !important;
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 22px 20px 18px;
}
.brand-logo {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #fcd021, #ffb300);
  box-shadow: 0 6px 18px rgba(252, 208, 33, 0.25);
}
.brand-logo.custom {
  background: #fff;
  overflow: hidden;
}
.brand-name,
.brand-sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.brand-name {
  font-weight: 800;
  font-size: 1.05rem;
  color: #fff;
  letter-spacing: -0.01em;
}
.brand-sub {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
}
.nav-label {
  padding: 18px 22px 6px;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.35);
}
.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 12px;
}
.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.68);
  text-decoration: none;
  font-weight: 500;
  font-size: 0.92rem;
  transition:
    background 0.15s,
    color 0.15s;
}
.nav-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}
.nav-item.active {
  background: rgba(252, 208, 33, 0.14);
  color: #fcd021;
  font-weight: 700;
}
.nav-item.active::before {
  content: '';
  position: absolute;
  left: -12px;
  top: 8px;
  bottom: 8px;
  width: 4px;
  border-radius: 0 4px 4px 0;
  background: #fcd021;
}
.me {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px;
  padding: 10px 8px 10px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
}
.me-name {
  color: #fff;
  font-weight: 700;
  font-size: 0.9rem;
}
.me-role {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.75rem;
}

/* ── top bar ── */
/* Let the search results drop down below the bar instead of being cut off. */
.topbar,
.topbar :deep(.v-toolbar__content) {
  overflow: visible !important;
}
.topbar {
  background: rgba(var(--v-theme-background), 0.82) !important;
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06) !important;
}
.live-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 700;
}
.live-pill.on {
  color: #1d8a4a;
  background: rgba(46, 158, 91, 0.12);
}
.live-pill.off {
  color: rgba(var(--v-theme-on-surface), 0.6);
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.live-pill .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}
.live-pill.on .dot {
  box-shadow: 0 0 0 0 rgba(46, 158, 91, 0.6);
  animation: pulse 1.8s infinite;
}
@keyframes pulse {
  70% {
    box-shadow: 0 0 0 7px rgba(46, 158, 91, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(46, 158, 91, 0);
  }
}
</style>
