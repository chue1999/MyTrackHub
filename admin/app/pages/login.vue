<script setup lang="ts">
const { branding } = useBranding()
definePageMeta({ layout: false })

const { login } = useAuth()
const username = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')
const isCcareAccount = ref(false)
const capsLock = ref(false)
const route = useRoute()
const idleNotice = computed(() => route.query.reason === 'idle' && !error.value)

async function submit() {
  if (!username.value || !password.value) return
  loading.value = true
  error.value = ''
  isCcareAccount.value = false
  try {
    await login(username.value.trim(), password.value)
    await navigateTo('/')
  } catch (e) {
    // A CCare account typed here is sent to its own portal.
    if ((e as { data?: { code?: string } })?.data?.code === 'USE_CCARE_PORTAL') {
      isCcareAccount.value = true
      error.value = 'This is a CCare account. Use the CCare sign-in page.'
    } else {
      error.value = errorMessage(e, 'Cannot reach the server. Is the API running?')
    }
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

// Playful virus hunt: a knife-wielding hunter chases a virus around the ring. A
// "catch" kills the virus (green), otherwise it escapes (red). The scoreboard counts
// viruses killed vs escaped. Each round is one chase; a new activity starts the next.
const phase = ref<'fight' | 'win'>('fight')
const winner = ref<'green' | 'red'>('green')
const greenWins = ref(0) // viruses killed
const redWins = ref(0) // viruses escaped
let fightT: ReturnType<typeof setTimeout> | undefined
let nextT: ReturnType<typeof setTimeout> | undefined

const statusText = computed(() =>
  phase.value === 'fight' ? 'Hunting…' : winner.value === 'green' ? 'Killed' : 'Escaped',
)
const statusClass = computed(() => (phase.value === 'fight' ? 'st-run' : winner.value === 'green' ? 'st-ok' : 'st-err'))

function round() {
  phase.value = 'fight'
  fightT = setTimeout(() => {
    // The hunter usually catches the virus.
    winner.value = Math.random() < 0.72 ? 'green' : 'red'
    if (winner.value === 'green') greenWins.value += 1
    else redWins.value += 1
    phase.value = 'win'
    nextT = setTimeout(round, 2000)
  }, 1900)
}
onMounted(round)
onBeforeUnmount(() => {
  clearTimeout(fightT)
  clearTimeout(nextT)
})
</script>

<template>
  <v-main class="login-page">
    <div class="login-grid">
      <!-- Brand panel -->
      <section class="brand d-none d-md-flex">
        <div class="brand-glow brand-glow--1" />
        <div class="brand-glow brand-glow--2" />
        <div class="brand-grid" />

        <div class="d-flex align-center ga-3 reveal">
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

        <div class="brand-copy reveal reveal-2">
          <h1 class="brand-title">See what your users do, the moment they do it.</h1>
          <p class="brand-sub">Logins, screens and taps from the MyTPlus app, streamed live to one dashboard.</p>

          <!-- playful: a knife-wielding hunter chases a virus round the ring; AI shows the result -->
          <div class="arena" :class="phase === 'win' ? `done ${winner}-wins` : 'fighting'" aria-hidden="true">
            <div class="arena-head">
              <span class="ai-chip" :class="statusClass">
                <span class="ai-bot">🤖</span>
                <span>{{ statusText }}</span>
              </span>
              <div class="score">
                <span class="sc" title="Viruses killed">💀 {{ greenWins }}</span>
                <span class="sc-vs">:</span>
                <span class="sc" title="Viruses escaped">🦠 {{ redWins }}</span>
              </div>
            </div>

            <div class="stage">
              <div class="orb green-orb">
                <div class="boxer green">
                  <span class="guy">🥷</span><span class="blade">🔪</span><span class="ko">💨</span>
                </div>
              </div>
              <div class="orb clash-orb"><span class="clash">💥</span></div>
              <div class="orb red-orb">
                <div class="boxer red"><span class="guy">🦠</span><span class="ko">💀</span></div>
              </div>
            </div>
          </div>

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

        <div class="d-flex ga-6 brand-stats reveal reveal-3">
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
        <div class="form-wrap reveal">
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

          <v-btn
            v-if="isCcareAccount"
            :to="`/ccare-login?name=${encodeURIComponent(username.trim())}`"
            color="primary"
            variant="tonal"
            block
            rounded="lg"
            class="mt-3 text-none font-weight-bold"
            prepend-icon="mdi-headset"
          >
            Go to CCare sign-in
          </v-btn>

          <div class="text-center mt-5 text-body-2">
            CCare staff?
            <NuxtLink to="/ccare-login" class="toggle-link">Sign in here</NuxtLink>
          </div>

          <div class="d-flex align-center ga-2 mt-6 text-caption text-medium-emphasis">
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
  background: linear-gradient(135deg, #ffd73a 0%, #ffbe16 45%, #ff9e2c 100%);
  background-size: 180% 180%;
  animation: brand-shift 16s ease-in-out infinite;
}
.brand-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(12px);
  pointer-events: none;
}
.brand-glow--1 {
  width: 520px;
  height: 520px;
  right: -180px;
  top: -160px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.6), transparent 65%);
  animation: float-a 13s ease-in-out infinite;
}
.brand-glow--2 {
  width: 420px;
  height: 420px;
  left: -160px;
  bottom: -180px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.4), transparent 65%);
  animation: float-b 17s ease-in-out infinite;
}
/* faint dotted grid for depth */
.brand-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(26, 26, 26, 0.07) 1px, transparent 1px);
  background-size: 22px 22px;
  mask-image: radial-gradient(ellipse at 30% 40%, #000 0%, transparent 75%);
  -webkit-mask-image: radial-gradient(ellipse at 30% 40%, #000 0%, transparent 75%);
}
@keyframes brand-shift {
  0%,
  100% {
    background-position: 0% 0%;
  }
  50% {
    background-position: 100% 100%;
  }
}
@keyframes float-a {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  50% {
    transform: translate(-26px, 30px) scale(1.06);
  }
}
@keyframes float-b {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  50% {
    transform: translate(24px, -26px) scale(1.08);
  }
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
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 22px;
  padding: 18px 20px;
  box-shadow:
    0 24px 48px rgba(120, 80, 0, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
  max-width: 420px;
}
.feed-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
  font-size: 0.9rem;
  opacity: 0;
  animation: feed-in 0.5s ease forwards;
}
.feed-item + .feed-item {
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}
.feed-icon {
  width: 28px;
  height: 28px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.18);
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

/* ── the duel: a transaction is a fight; green wins on success, red on failure ── */
.arena {
  width: 100%;
  max-width: 300px;
  margin-bottom: 10px;
  padding: 12px 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.55);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(6px);
}
.arena-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.ai-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px 3px 6px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: #1a1a1a;
  background: #fff;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.12);
}
.ai-chip .ai-bot {
  font-size: 15px;
  line-height: 1;
}
.st-run {
  color: #a16207;
}
.st-ok {
  color: #1f8a4c;
}
.st-err {
  color: #d0362b;
}
.score {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.sc {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.sc-vs {
  opacity: 0.5;
}

/* the two fighters run their duel around a 360° circle */
.stage {
  position: relative;
  width: 160px;
  height: 160px;
  margin: 0 auto;
}
.orb {
  position: absolute;
  top: 0;
  left: 0;
  width: 44px;
  height: 44px;
  offset-path: circle(54px at 50% 50%);
  offset-anchor: 50% 50%;
  offset-rotate: 0deg;
  animation: orbit 4s linear infinite;
}
/* spread so you can see green chase red around the ring, clash in between */
.green-orb {
  animation-delay: -0.08s;
}
.red-orb {
  animation-delay: -0.48s;
}
.clash-orb {
  width: 24px;
  height: 24px;
  animation-delay: -0.28s;
}
.boxer {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: grid;
  place-items: center;
}
.boxer.green {
  background: radial-gradient(circle at 40% 35%, #e3fbec, #8fe3b0);
  box-shadow:
    0 0 0 3px #2e9e5b,
    0 8px 16px rgba(46, 158, 91, 0.4);
}
.boxer.red {
  background: radial-gradient(circle at 40% 35%, #ffe4e4, #ff9e9e);
  box-shadow:
    0 0 0 3px #e14b4b,
    0 8px 16px rgba(225, 75, 75, 0.4);
}
.guy {
  font-size: 24px;
  line-height: 1;
}
/* the hunter's knife, held out toward the virus ahead */
.blade {
  position: absolute;
  right: -4px;
  bottom: 2px;
  font-size: 16px;
  transform-origin: bottom left;
}
.fighting .green-orb .blade {
  animation: stab 0.5s ease-in-out infinite;
}
.ko {
  position: absolute;
  top: -18px;
  left: 50%;
  margin-left: -10px;
  font-size: 20px;
  opacity: 0;
  scale: 0;
}
.clash {
  display: block;
  text-align: center;
  font-size: 22px;
  opacity: 0;
}

/* fighting: both bob as they run; the clash sparks between them */
.fighting .boxer {
  animation: hop 0.5s ease-in-out infinite;
}
.fighting .clash {
  animation: spark 0.5s ease-in-out infinite;
}
/* green wins (success): red is knocked out, green cheers — both keep circling */
.green-wins .red-orb .boxer {
  animation: fall 0.6s ease-in forwards;
}
.green-wins .red-orb .ko {
  animation: ko-pop 0.5s 0.15s ease-out forwards;
}
.green-wins .green-orb .boxer {
  animation: cheer 0.6s ease-out;
}
/* red wins (failure): green goes down */
.red-wins .green-orb .boxer {
  animation: fall 0.6s ease-in forwards;
}
.red-wins .green-orb .ko {
  animation: ko-pop 0.5s 0.15s ease-out forwards;
}
.red-wins .red-orb .boxer {
  animation: cheer 0.6s ease-out;
}
@keyframes orbit {
  from {
    offset-distance: 0%;
  }
  to {
    offset-distance: 100%;
  }
}
@keyframes hop {
  0%,
  100% {
    translate: 0 0;
  }
  50% {
    translate: 0 -5px;
  }
}
@keyframes spark {
  0%,
  100% {
    opacity: 0;
    scale: 0.6;
  }
  50% {
    opacity: 1;
    scale: 1.15;
  }
}
@keyframes fall {
  to {
    transform: translateY(5px) rotate(78deg);
    opacity: 0.35;
  }
}
@keyframes cheer {
  0%,
  100% {
    transform: translateY(0);
  }
  40% {
    transform: translateY(-7px) scale(1.08);
  }
}
@keyframes stab {
  0%,
  100% {
    rotate: 8deg;
    translate: 0 0;
  }
  50% {
    rotate: 30deg;
    translate: 3px -3px;
  }
}
@keyframes ko-pop {
  0% {
    opacity: 0;
    scale: 0;
    translate: 0 6px;
  }
  60% {
    opacity: 1;
    scale: 1.25;
  }
  100% {
    opacity: 1;
    scale: 1;
    translate: 0 0;
  }
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
.toggle-link {
  color: rgb(var(--v-theme-primary));
  font-weight: 700;
  text-decoration: none;
}
.toggle-link:hover {
  text-decoration: underline;
}

/* ── entrance ── */
.reveal {
  animation: reveal-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.reveal-2 {
  animation-delay: 0.1s;
}
.reveal-3 {
  animation-delay: 0.2s;
}
@keyframes reveal-up {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* ── input focus glow ── */
.form-wrap :deep(.v-field) {
  transition:
    box-shadow 0.2s ease,
    transform 0.2s ease;
}
.form-wrap :deep(.v-field--focused) {
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.28);
}

/* ── submit button polish ── */
.submit-btn {
  letter-spacing: 0;
  position: relative;
  overflow: hidden;
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.22);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease;
}
.submit-btn::after {
  content: '';
  position: absolute;
  top: 0;
  left: -120%;
  width: 60%;
  height: 100%;
  background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.28), transparent);
  transition: left 0.5s ease;
}
.submit-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 18px 34px rgba(0, 0, 0, 0.28);
}
.submit-btn:hover::after {
  left: 140%;
}

/* The little duel is tiny and decorative, so it keeps playing even with reduced
   motion; only the larger background/page motion is calmed down. */
@media (prefers-reduced-motion: reduce) {
  .brand,
  .brand-glow,
  .feed-item,
  .reveal,
  .submit-btn,
  .submit-btn::after {
    animation: none !important;
    transition: none !important;
  }
}
</style>
