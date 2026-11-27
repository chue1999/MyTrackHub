<script setup lang="ts">
import { useDisplay, useTheme } from 'vuetify'
import type { AdminInfo } from '~/types/api'
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
    const me = await api<AdminInfo>('/auth/me')
    admin.value = {
      id: me.id,
      username: me.username,
      displayName: me.displayName,
      role: me.role,
      kind: me.kind,
      canManage: me.canManage,
    }
  } catch {
    // Offline or API down: keep the account info stored at login.
  }
})

const isCcare = computed(() => admin.value?.kind === 'ccare')
const canManageCcare = computed(() => admin.value?.role === 'admin' || admin.value?.canManage === true)

// TPLUS service pages (ported from the legacy PHP app). Available to every
// signed-in CCare member and to MyTPlus admins; each submit is logged.
const tplusNav = [
  {
    title: 'Register E-SIM',
    icon: 'mdi-sim-outline',
    activeIcon: 'mdi-sim',
    to: '/tplus-esim-register',
    active: (p: string) => p.startsWith('/tplus-esim-register'),
  },
  {
    title: 'Confirm Nice Number',
    icon: 'mdi-star-check-outline',
    activeIcon: 'mdi-star-check',
    to: '/tplus-nice-confirm',
    active: (p: string) => p.startsWith('/tplus-nice-confirm'),
  },
  {
    title: 'Approve Add/Delete',
    icon: 'mdi-check-decagram-outline',
    activeIcon: 'mdi-check-decagram',
    to: '/tplus-pool-approve',
    active: (p: string) => p.startsWith('/tplus-pool-approve'),
  },
]

// One Logs page with a tab per log (MyTPlus / CCare). Admins only: a MyTPlus
// admin sees both tabs, a CCare admin just the CCare tab.
const logsItem = {
  title: 'Logs',
  icon: 'mdi-clipboard-text-clock-outline',
  activeIcon: 'mdi-clipboard-text-clock',
  to: '/logs',
  active: (p: string) =>
    p.startsWith('/logs') || p.startsWith('/events') || p.startsWith('/ccare-log/') || p === '/ccare-logs',
}

// CCare pages. Managers get the full console; plain staff just the Service console.
const ccareNav = computed(() =>
  canManageCcare.value
    ? [
        {
          title: 'CCare service',
          icon: 'mdi-cellphone-cog',
          activeIcon: 'mdi-cellphone-cog',
          to: '/ccare-vas',
          active: (p: string) => p.startsWith('/ccare-vas'),
        },
      ]
    : [
        {
          title: 'CCare service',
          icon: 'mdi-headset',
          activeIcon: 'mdi-headset',
          to: '/ccare-vas',
          active: (p: string) => p.startsWith('/ccare-vas'),
        },
      ],
)

// CCare user management lives under Settings (managers / MyTPlus admins only).
const ccareUsersItem = {
  title: 'CCare users',
  icon: 'mdi-account-group-outline',
  activeIcon: 'mdi-account-group',
  to: '/ccare',
  active: (p: string) => p === '/ccare' || p.startsWith('/ccare-user'),
}
const ccareSettingsNav = computed(() => (canManageCcare.value ? [ccareUsersItem] : []))

const overviewNav = [
  { title: 'Dashboard', icon: 'mdi-view-dashboard-outline', activeIcon: 'mdi-view-dashboard', to: '/' },
  { title: 'Users', icon: 'mdi-account-group-outline', activeIcon: 'mdi-account-group', to: '/users' },
  { title: 'App features', icon: 'mdi-apps', activeIcon: 'mdi-apps', to: '/features' },
  { title: 'Packages', icon: 'mdi-package-variant', activeIcon: 'mdi-package-variant-closed', to: '/packages' },
  { title: 'Reports', icon: 'mdi-file-chart-outline', activeIcon: 'mdi-file-chart', to: '/reports' },
]
const settingsNav = computed(() => [
  { title: 'Settings', icon: 'mdi-cog-outline', activeIcon: 'mdi-cog', to: '/settings' },
  ...ccareSettingsNav.value,
  ...(admin.value?.role === 'admin'
    ? [
        {
          title: 'Admin accounts',
          icon: 'mdi-shield-account-outline',
          activeIcon: 'mdi-shield-account',
          to: '/accounts',
        },
        { title: 'SQL Query', icon: 'mdi-database-search-outline', activeIcon: 'mdi-database-search', to: '/sql' },
        { title: 'Server', icon: 'mdi-server-outline', activeIcon: 'mdi-server', to: '/server' },
      ]
    : []),
])

// Logs get their own group above Settings: MyTPlus admins and CCare admins only.
const logsNav = computed(() =>
  (isCcare.value ? admin.value?.canManage === true : admin.value?.role === 'admin') ? [logsItem] : [],
)
const logsSection = computed(() => (logsNav.value.length ? [{ label: 'Logs', items: logsNav.value }] : []))

// The sidebar is grouped into labelled sections. CCare staff see only CCare,
// TPLUS and (managers) Settings; MyTPlus admins see everything, each group under its own heading.
const sections = computed(() =>
  isCcare.value
    ? [
        { label: 'CCare', items: ccareNav.value },
        { label: 'TPLUS Services', items: tplusNav },
        ...logsSection.value,
        ...(ccareSettingsNav.value.length ? [{ label: 'Settings', items: ccareSettingsNav.value }] : []),
      ]
    : [
        { label: 'Overview', items: overviewNav },
        { label: 'CCare', items: ccareNav.value },
        { label: 'TPLUS Services', items: tplusNav },
        ...logsSection.value,
        { label: 'Settings', items: settingsNav.value },
      ],
)
const roleLabel = computed(() =>
  isCcare.value
    ? canManageCcare.value
      ? 'CCare admin'
      : 'CCare staff'
    : admin.value?.role === 'admin'
      ? 'Administrator'
      : 'Viewer',
)
const isActive = (item: { to: string; active?: (p: string) => boolean }) =>
  item.active ? item.active(route.path) : item.to === '/' ? route.path === '/' : route.path.startsWith(item.to)

const displayName = computed(() => admin.value?.displayName || admin.value?.username || '')
</script>

<template>
  <v-layout class="app-shell">
    <v-navigation-drawer v-model="drawer" :permanent="mdAndUp" width="260" class="sidebar" theme="dark">
      <div class="brand">
        <div class="brand-logo" :class="{ custom: branding.logo && !isCcare }">
          <v-icon v-if="isCcare" icon="mdi-headset" size="24" color="#1a1a1a" />
          <BrandMark v-else size="24" />
        </div>
        <div style="min-width: 0">
          <div class="brand-name">{{ isCcare ? 'My CCare' : branding.name }}</div>
          <div v-if="isCcare || branding.subtitle" class="brand-sub">
            {{ isCcare ? 'Customer Care' : branding.subtitle }}
          </div>
        </div>
      </div>

      <template v-for="section in sections" :key="section.label">
        <div v-if="section.items.length" class="nav-label">{{ section.label }}</div>
        <nav v-if="section.items.length" class="nav">
          <NuxtLink
            v-for="item in section.items"
            :key="item.to"
            :to="item.to"
            class="nav-item"
            :class="{ active: isActive(item) }"
          >
            <v-icon :icon="isActive(item) ? item.activeIcon : item.icon" size="20" />
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
            <div class="me-role">{{ roleLabel }}</div>
          </div>
          <v-menu location="top end">
            <template #activator="{ props }">
              <v-btn v-bind="props" icon="mdi-dots-vertical" variant="text" size="small" />
            </template>
            <v-list density="compact" min-width="200">
              <v-list-item
                v-if="!isCcare"
                prepend-icon="mdi-lock-reset"
                title="Change password"
                @click="pwDialog = true"
              />
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

    <!-- AI chat: on every page, stays open while you move between pages -->
    <AiChat />
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
