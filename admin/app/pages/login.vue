<script setup lang="ts">
const { branding } = useBranding()
definePageMeta({ layout: false })

const { login } = useAuth()
const username = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')
const capsLock = ref(false)
const route = useRoute()
const idleNotice = computed(() => route.query.reason === 'idle' && !error.value)

async function submit() {
  if (!username.value || !password.value) return
  loading.value = true
  error.value = ''
  try {
    await login(username.value.trim(), password.value)
    await navigateTo('/')
  } catch (e) {
    error.value = errorMessage(e, 'Cannot reach the server. Is the API running?')
  } finally {
    loading.value = false
  }
}

function onKey(e: KeyboardEvent) {
  capsLock.value = e.getModifierState?.('CapsLock') ?? false
}

// Decorative live feed on the brand panel.
const sample = [
  { icon: 'mdi-login', color: '#2E9E5B', who: 'Somsack P.', what: 'logged in' },
  { icon: 'mdi-gesture-tap', color: '#E09A00', who: 'Noy V.', what: 'tapped Points' },
  { icon: 'mdi-cellphone-screenshot', color: '#2F80ED', who: 'Khamla S.', what: 'opened Redeem Premium' },
  { icon: 'mdi-gesture-tap', color: '#E09A00', who: 'Vanh K.', what: 'tapped Book a queue' },
]
</script>

<template>
  <v-main class="login-page">
    <div class="login-grid">
      <!-- Brand panel -->
      <section class="brand d-none d-md-flex">
        <div class="brand-glow brand-glow--1" />
        <div class="brand-glow brand-glow--2" />

        <div class="d-flex align-center ga-3">
          <div class="logo">
            <BrandMark size="26" color="#F5B800" />
          </div>
          <div>
            <div class="text-h6 font-weight-black">{{ branding.name }}</div>
            <div v-if="branding.subtitle" class="text-caption font-weight-medium" style="opacity: 0.75">
              {{ branding.subtitle }}
            </div>
          </div>
        </div>

        <div class="brand-copy">
          <h1 class="brand-title">See what your users do, the moment they do it.</h1>
          <p class="brand-sub">Logins, screens and taps from the MyTPlus app, streamed live to one dashboard.</p>

          <div class="feed-card">
            <div class="d-flex align-center mb-3">
              <span class="pulse" />
              <span class="text-caption font-weight-bold ml-2">LIVE</span>
              <v-spacer />
              <span class="text-caption" style="opacity: 0.6">just now</span>
            </div>
            <div v-for="(s, i) in sample" :key="i" class="feed-item" :style="{ animationDelay: `${i * 0.6}s` }">
              <div class="feed-icon" :style="{ background: s.color }">
                <v-icon :icon="s.icon" size="14" color="white" />
              </div>
              <span class="font-weight-bold">{{ s.who }}</span>
              <span style="opacity: 0.7">{{ s.what }}</span>
            </div>
          </div>
        </div>

        <div class="d-flex ga-6 brand-stats">
          <div>
            <div class="text-h6 font-weight-black">Real-time</div>
            <div class="text-caption" style="opacity: 0.7">Server-sent events</div>
          </div>
          <div>
            <div class="text-h6 font-weight-black">Private</div>
            <div class="text-caption" style="opacity: 0.7">No OTPs or passwords stored</div>
          </div>
        </div>
      </section>

      <!-- Form -->
      <section class="form-side">
        <div class="form-wrap">
          <div class="d-flex d-md-none align-center ga-3 mb-8">
            <div class="logo logo--dark">
              <BrandMark size="24" />
            </div>
            <div class="text-h6 font-weight-black">{{ branding.title }}</div>
          </div>

          <div class="text-overline text-primary font-weight-bold">Admin</div>
          <h2 class="text-h4 font-weight-black mb-1">Welcome back</h2>
          <p class="text-body-1 text-medium-emphasis mb-8">Log in to open the activity dashboard.</p>

          <v-form @submit.prevent="submit">
            <label class="field-label">Username</label>
            <v-text-field
              v-model="username"
              placeholder="admin"
              prepend-inner-icon="mdi-account-outline"
              autocomplete="username"
              variant="solo-filled"
              flat
              rounded="lg"
              autofocus
              class="mb-1"
            />

            <label class="field-label">Password</label>
            <v-text-field
              v-model="password"
              placeholder="••••••••"
              prepend-inner-icon="mdi-lock-outline"
              :type="showPassword ? 'text' : 'password'"
              :append-inner-icon="showPassword ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
              autocomplete="current-password"
              variant="solo-filled"
              flat
              rounded="lg"
              :hint="capsLock ? 'Caps Lock is on' : ''"
              :persistent-hint="capsLock"
              @click:append-inner="showPassword = !showPassword"
              @keyup="onKey"
              @keydown="onKey"
            />

            <v-expand-transition>
              <v-alert
                v-if="error"
                type="error"
                variant="tonal"
                density="compact"
                rounded="lg"
                class="mt-2 mb-2"
                :text="error"
              />
              <v-alert
                v-else-if="idleNotice"
                type="info"
                variant="tonal"
                density="compact"
                rounded="lg"
                class="mt-2 mb-2"
                icon="mdi-timer-sand"
                text="You were signed out after 10 minutes with no activity. Please sign in again."
              />
            </v-expand-transition>

            <v-btn
              type="submit"
              color="secondary"
              block
              size="x-large"
              rounded="lg"
              :loading="loading"
              :disabled="!username || !password"
              class="mt-4 text-none font-weight-bold submit-btn"
              append-icon="mdi-arrow-right"
            >
              Log in
            </v-btn>
          </v-form>

          <div class="d-flex align-center ga-2 mt-8 text-caption text-medium-emphasis">
            <v-icon icon="mdi-shield-check-outline" size="16" />
            Only authorised T-Plus staff. Forgot your password? Ask an administrator to reset it.
          </div>
        </div>
      </section>
    </div>
  </v-main>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  background: rgb(var(--v-theme-background));
}
.login-grid {
  display: grid;
  grid-template-columns: 1fr;
  min-height: 100vh;
}
@media (min-width: 960px) {
  .login-grid {
    grid-template-columns: 1.1fr 1fr;
  }
}

/* ── brand panel ── */
.brand {
  position: relative;
  overflow: hidden;
  flex-direction: column;
  justify-content: space-between;
  padding: 40px 56px;
  color: #1a1a1a;
  background: linear-gradient(135deg, #fcd021 0%, #ffb300 100%);
}
.brand-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(10px);
  pointer-events: none;
}
.brand-glow--1 {
  width: 520px;
  height: 520px;
  right: -180px;
  top: -160px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.55), transparent 65%);
}
.brand-glow--2 {
  width: 420px;
  height: 420px;
  left: -160px;
  bottom: -180px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.35), transparent 65%);
}
.logo {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: #1a1a1a;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.18);
}
.logo:has(img) {
  background: #fff;
  overflow: hidden;
}
.logo--dark {
  background: rgb(var(--v-theme-primary));
  box-shadow: none;
}
.brand-copy {
  position: relative;
  max-width: 520px;
}
.brand-title {
  font-size: 2.6rem;
  line-height: 1.15;
  font-weight: 900;
  letter-spacing: -0.02em;
  margin-bottom: 14px;
}
.brand-sub {
  font-size: 1.05rem;
  opacity: 0.8;
  margin-bottom: 32px;
}
.feed-card {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(8px);
  border-radius: 20px;
  padding: 18px 20px;
  box-shadow: 0 20px 40px rgba(120, 80, 0, 0.18);
  max-width: 420px;
}
.feed-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  font-size: 0.9rem;
  opacity: 0;
  animation: feed-in 0.5s ease forwards;
}
.feed-item + .feed-item {
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}
.feed-icon {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
@keyframes feed-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.pulse {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #2e9e5b;
  box-shadow: 0 0 0 0 rgba(46, 158, 91, 0.6);
  animation: pulse 1.8s infinite;
}
@keyframes pulse {
  70% {
    box-shadow: 0 0 0 9px rgba(46, 158, 91, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(46, 158, 91, 0);
  }
}
.brand-stats {
  position: relative;
}

/* ── form side ── */
.form-side {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  background: rgb(var(--v-theme-surface));
}
.form-wrap {
  width: 100%;
  max-width: 400px;
}
.field-label {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 6px;
}
.submit-btn {
  letter-spacing: 0;
}
</style>
