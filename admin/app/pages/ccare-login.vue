<script setup lang="ts">
import type { OtpChallenge } from '~/composables/useAuth'

/**
 * CCare staff portal sign-in: password → one-time SMS code. Also register a new
 * account and reset a forgotten password (both by SMS code). Separate from the
 * MyTPlus admin login, with its own "My CCare" identity (MyTPlus yellow brand).
 */
definePageMeta({ layout: false })
useHead({ title: 'My CCare — Sign in' })

const { ccareStart, ccareVerify, ccareForgot, ccareResetCheck, ccareReset, ccareRegister, ccareConfig } = useAuth()
const route = useRoute()

// In "proxy" mode passwords live in the My CCare system, so self-service create
// and reset are off (shown only when the API allows them).
const canRegister = ref(false)
const canReset = ref(false)
onMounted(async () => {
  try {
    const c = await ccareConfig()
    canRegister.value = c.canRegister
    canReset.value = c.canReset
  } catch {
    // keep both off
  }
})

type Step = 'password' | 'otp' | 'register' | 'forgotName' | 'forgotOtp' | 'forgotNew'
const step = ref<Step>('password')
const loading = ref(false)
const error = ref('')
// Set when sign-in was refused because the password is older than 30 days.
const expired = ref(false)
const notice = ref(route.query.reason === 'idle' ? 'You were signed out. Please sign in again.' : '')

const name = ref((route.query.name as string) || '')
const password = ref('')
const showPw = ref(false)

const challenge = ref<OtpChallenge | null>(null)
const code = ref('')
const resetPw = ref('')
const resetTicket = ref('')
const resetPw2 = ref('')

// Register fields.
const reg = reactive({ name: '', password: '', nameLa: '', staffId: '', staffTel: '', division: '' })

function go(to: Step) {
  step.value = to
  error.value = ''
  expired.value = false
}

async function run(fn: () => Promise<void>) {
  loading.value = true
  error.value = ''
  try {
    await fn()
  } catch (e) {
    error.value = errorMessage(e, 'Something went wrong. Please try again.')
    expired.value = (e as { data?: { code?: string } })?.data?.code === 'PASSWORD_EXPIRED'
  } finally {
    loading.value = false
  }
}

const startLogin = () =>
  run(async () => {
    // Trim both, like the My CCare web does, so a stray space never fails login.
    challenge.value = await ccareStart(name.value.trim(), password.value.trim())
    code.value = ''
    go('otp')
  })

const verify = () =>
  run(async () => {
    await ccareVerify(challenge.value!.challenge, code.value.trim())
    await navigateTo('/ccare-vas')
  })

const resend = () =>
  run(async () => {
    challenge.value = await ccareStart(name.value.trim(), password.value)
    notice.value = 'A new code has been sent.'
  })

const doRegister = () =>
  run(async () => {
    await ccareRegister({
      name: reg.name.trim(),
      password: reg.password,
      nameLa: reg.nameLa.trim() || undefined,
      staffId: reg.staffId.trim() || undefined,
      staffTel: reg.staffTel.trim() || undefined,
      division: reg.division.trim() || undefined,
    })
    name.value = reg.name.trim()
    password.value = ''
    notice.value = 'Account created. Please sign in — a code will be sent to your phone.'
    go('password')
  })

const startForgot = () =>
  run(async () => {
    challenge.value = await ccareForgot(name.value.trim())
    code.value = ''
    go('forgotOtp')
  })

// Forgot password: as soon as all digits are typed the code is checked; a right
// code goes straight to the new-password page, a wrong one is cleared to retype.
const checkResetCode = () => {
  if (loading.value || code.value.length < (challenge.value?.length ?? 6)) return
  return run(async () => {
    try {
      const r = await ccareResetCheck(challenge.value!.challenge, code.value.trim())
      resetTicket.value = r.ticket
      resetPw.value = ''
      resetPw2.value = ''
      go('forgotNew')
    } catch (e) {
      code.value = ''
      throw e
    }
  })
}
const resendForgot = () =>
  run(async () => {
    challenge.value = await ccareForgot(name.value.trim())
    code.value = ''
    notice.value = 'A new code has been sent.'
  })
const pwMatch = computed(() => !!resetPw2.value && resetPw.value === resetPw2.value)

const doReset = () =>
  run(async () => {
    try {
      await ccareReset(resetTicket.value, resetPw.value)
    } catch (e) {
      // The ticket is used up / expired: start the reset again.
      if (/expired|start again/i.test(errorMessage(e, ''))) {
        code.value = ''
        go('forgotName')
      }
      throw e
    }
    notice.value = 'Password changed. Please sign in with your new password.'
    password.value = ''
    resetTicket.value = ''
    go('password')
  })

const features = [
  { icon: 'mdi-sim', title: 'SIM & subscriber', text: 'Look up and manage SIMs by MSISDN or IMSI' },
  { icon: 'mdi-package-variant-closed', title: 'Packages & services', text: 'Assign packages, 5G/4G, IR and more' },
  { icon: 'mdi-shield-check', title: 'Secure & audited', text: 'One-time SMS code; every action is logged' },
]
</script>

<template>
  <v-main class="cc-page">
    <div class="cc-grid">
      <!-- Brand panel -->
      <section class="cc-brand d-none d-md-flex">
        <div class="cc-glow cc-glow--1" />
        <div class="cc-glow cc-glow--2" />

        <div class="d-flex align-center ga-3">
          <div class="cc-badge"><v-icon icon="mdi-headset" size="26" color="#1a1a1a" /></div>
          <div>
            <div class="text-h6 font-weight-black">My CCare</div>
            <div class="text-caption font-weight-medium" style="opacity: 0.75">Customer Care portal</div>
          </div>
        </div>

        <div class="cc-copy">
          <h1 class="cc-brand-title">Help customers in seconds.</h1>
          <p class="cc-brand-sub">
            Look up SIMs, manage packages and run services — all in one place, with every action recorded.
          </p>

          <div class="cc-feature-card">
            <div v-for="(f, i) in features" :key="i" class="cc-feature" :style="{ animationDelay: `${i * 0.6}s` }">
              <div class="cc-feature-icon"><v-icon :icon="f.icon" size="18" color="#1a1a1a" /></div>
              <div>
                <div class="font-weight-bold">{{ f.title }}</div>
                <div style="opacity: 0.7; font-size: 0.85rem">{{ f.text }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="d-flex ga-8 cc-brand-stats">
          <div>
            <div class="text-h6 font-weight-black">Secure</div>
            <div class="text-caption" style="opacity: 0.7">OTP sign-in</div>
          </div>
          <div>
            <div class="text-h6 font-weight-black">Audited</div>
            <div class="text-caption" style="opacity: 0.7">Every action logged</div>
          </div>
        </div>
      </section>

      <!-- Form panel -->
      <section class="cc-form-side">
        <div class="cc-form-wrap">
          <div class="d-flex d-md-none align-center ga-3 mb-8">
            <div class="cc-badge cc-badge--sm"><v-icon icon="mdi-headset" size="22" color="#1a1a1a" /></div>
            <div class="text-h6 font-weight-black">My CCare</div>
          </div>

          <v-alert
            v-if="notice && !error"
            type="info"
            variant="tonal"
            density="compact"
            rounded="lg"
            class="mb-4"
            :text="notice"
          />
          <v-alert
            v-if="error"
            :type="expired ? 'warning' : 'error'"
            :icon="expired ? 'mdi-lock-clock' : undefined"
            variant="tonal"
            density="compact"
            rounded="lg"
            class="mb-4"
            :text="error"
          >
            <template v-if="expired && canReset" #append>
              <v-btn size="small" color="warning" variant="flat" class="text-none" @click="go('forgotName')"
                >Set new password</v-btn
              >
            </template>
          </v-alert>

          <Transition name="cc-step" mode="out-in">
            <div :key="step">
              <!-- Step: password -->
              <form v-if="step === 'password'" @submit.prevent="startLogin">
                <div class="text-overline text-primary font-weight-bold">Customer Care</div>
                <h2 class="cc-h1">Sign in</h2>
                <p class="cc-lead">
                  Enter your username and password — we'll text a one-time code to your phone every time.
                </p>

                <label class="cc-label">Username</label>
                <v-text-field
                  v-model="name"
                  prepend-inner-icon="mdi-account-outline"
                  variant="solo-filled"
                  flat
                  rounded="lg"
                  autofocus
                  class="mb-1"
                />
                <label class="cc-label">Password</label>
                <v-text-field
                  v-model="password"
                  :type="showPw ? 'text' : 'password'"
                  prepend-inner-icon="mdi-lock-outline"
                  :append-inner-icon="showPw ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                  variant="solo-filled"
                  flat
                  rounded="lg"
                  @click:append-inner="showPw = !showPw"
                />
                <v-btn
                  type="submit"
                  color="primary"
                  block
                  size="x-large"
                  rounded="lg"
                  :loading="loading"
                  :disabled="!name || !password"
                  class="mt-3 text-none text-black font-weight-bold"
                  append-icon="mdi-arrow-right"
                >
                  Continue
                </v-btn>
                <div v-if="canReset || canRegister" class="d-flex justify-space-between mt-5 text-body-2">
                  <a v-if="canReset" href="#" class="cc-link" @click.prevent="go('forgotName')">Forgot password?</a>
                  <span v-else />
                  <a v-if="canRegister" href="#" class="cc-link" @click.prevent="go('register')">Create account</a>
                </div>
              </form>

              <!-- Step: OTP -->
              <form v-else-if="step === 'otp'" @submit.prevent="verify">
                <div class="text-overline text-primary font-weight-bold">Verify</div>
                <h2 class="cc-h1">Enter code</h2>
                <p class="cc-lead">
                  We sent a {{ challenge?.length ?? 6 }}-digit code to <b>{{ challenge?.phoneHint }}</b>.
                </p>
                <v-alert
                  v-if="
                    challenge?.passwordDaysLeft !== undefined &&
                    challenge?.passwordDaysLeft !== null &&
                    challenge.passwordDaysLeft <= 7
                  "
                  type="warning"
                  variant="tonal"
                  density="compact"
                  rounded="lg"
                  class="mb-3"
                  icon="mdi-lock-clock"
                  :text="`Your password expires in ${challenge.passwordDaysLeft} day(s). After you sign in, change it with “Forgot password” so you are not locked out.`"
                />
                <v-alert
                  v-if="challenge?.devCode"
                  type="warning"
                  variant="tonal"
                  density="compact"
                  rounded="lg"
                  class="mb-3"
                  :text="`Test code (SMS off): ${challenge.devCode}`"
                />
                <v-otp-input
                  v-model="code"
                  :length="challenge?.length ?? 6"
                  type="number"
                  class="cc-otp"
                  @finish="verify"
                />
                <v-btn
                  type="submit"
                  color="primary"
                  block
                  size="x-large"
                  rounded="lg"
                  :loading="loading"
                  :disabled="code.length < (challenge?.length ?? 6)"
                  class="mt-3 text-none text-black font-weight-bold"
                >
                  Verify &amp; sign in
                </v-btn>
                <div class="d-flex justify-space-between mt-5 text-body-2">
                  <a href="#" class="cc-link" @click.prevent="go('password')">← Back</a>
                  <a href="#" class="cc-link" @click.prevent="resend">Resend code</a>
                </div>
              </form>

              <!-- Step: register -->
              <form v-else-if="step === 'register'" @submit.prevent="doRegister">
                <div class="text-overline text-primary font-weight-bold">New account</div>
                <h2 class="cc-h1">Create account</h2>
                <p class="cc-lead">Register a new CCare staff account.</p>
                <label class="cc-label">Username</label>
                <v-text-field
                  v-model="reg.name"
                  variant="solo-filled"
                  flat
                  rounded="lg"
                  density="comfortable"
                  class="mb-1"
                />
                <label class="cc-label">Password</label>
                <v-text-field
                  v-model="reg.password"
                  type="password"
                  variant="solo-filled"
                  flat
                  rounded="lg"
                  density="comfortable"
                  class="mb-1"
                />
                <label class="cc-label">Name (Lao)</label>
                <v-text-field
                  v-model="reg.nameLa"
                  placeholder="ຊື່ ນາມສะກຸນ"
                  variant="solo-filled"
                  flat
                  rounded="lg"
                  density="comfortable"
                  class="mb-1"
                />
                <div class="d-flex ga-2">
                  <div class="flex-grow-1">
                    <label class="cc-label">Staff ID</label>
                    <v-text-field
                      v-model="reg.staffId"
                      variant="solo-filled"
                      flat
                      rounded="lg"
                      density="comfortable"
                      class="mb-1"
                    />
                  </div>
                  <div class="flex-grow-1">
                    <label class="cc-label">Phone (for codes)</label>
                    <v-text-field
                      v-model="reg.staffTel"
                      placeholder="20xxxxxxxx"
                      variant="solo-filled"
                      flat
                      rounded="lg"
                      density="comfortable"
                      class="mb-1"
                    />
                  </div>
                </div>
                <label class="cc-label">Division</label>
                <v-text-field v-model="reg.division" variant="solo-filled" flat rounded="lg" density="comfortable" />
                <v-btn
                  type="submit"
                  color="primary"
                  block
                  size="large"
                  rounded="lg"
                  :loading="loading"
                  :disabled="!reg.name || reg.password.length < 4"
                  class="mt-2 text-none text-black font-weight-bold"
                >
                  Create account
                </v-btn>
                <div class="text-center mt-4 text-body-2">
                  <a href="#" class="cc-link" @click.prevent="go('password')">← Back to sign in</a>
                </div>
              </form>

              <!-- Step: forgot — name -->
              <form v-else-if="step === 'forgotName'" @submit.prevent="startForgot">
                <div class="text-overline text-primary font-weight-bold">Reset</div>
                <h2 class="cc-h1">Reset password</h2>
                <p class="cc-lead">Enter your username — we'll text a code to the phone on file.</p>
                <label class="cc-label">Username</label>
                <v-text-field
                  v-model="name"
                  prepend-inner-icon="mdi-account-outline"
                  variant="solo-filled"
                  flat
                  rounded="lg"
                  autofocus
                />
                <v-btn
                  type="submit"
                  color="primary"
                  block
                  size="x-large"
                  rounded="lg"
                  :loading="loading"
                  :disabled="!name"
                  class="mt-3 text-none text-black font-weight-bold"
                >
                  Send code
                </v-btn>
                <div class="text-center mt-5 text-body-2">
                  <a href="#" class="cc-link" @click.prevent="go('password')">← Back to sign in</a>
                </div>
              </form>

              <!-- Step: forgot — code (checked as soon as it is complete) -->
              <form v-else-if="step === 'forgotOtp'" @submit.prevent="checkResetCode">
                <div class="cc-steps">
                  <span class="on">1 · Code</span>
                  <span class="line" />
                  <span>2 · New password</span>
                </div>
                <div class="text-overline text-primary font-weight-bold">Reset</div>
                <h2 class="cc-h1">Enter code</h2>
                <p class="cc-lead">
                  We sent a {{ challenge?.length ?? 6 }}-digit code to <b>{{ challenge?.phoneHint }}</b>.
                </p>
                <v-alert
                  v-if="challenge?.devCode"
                  type="warning"
                  variant="tonal"
                  density="compact"
                  rounded="lg"
                  class="mb-3"
                  :text="`Test code (SMS off): ${challenge.devCode}`"
                />
                <v-otp-input
                  v-model="code"
                  :length="challenge?.length ?? 6"
                  type="number"
                  class="cc-otp"
                  :class="{ 'cc-otp--error': !!error }"
                  :loading="loading"
                  :disabled="loading"
                  autofocus
                  @finish="checkResetCode"
                />
                <div class="cc-otp-hint">
                  <template v-if="loading"><v-progress-circular indeterminate size="14" width="2" /> Checking…</template>
                  <template v-else>The next step opens by itself when the code is right.</template>
                </div>
                <div class="d-flex justify-space-between mt-5 text-body-2">
                  <a href="#" class="cc-link" @click.prevent="go('forgotName')">← Back</a>
                  <a href="#" class="cc-link" @click.prevent="resendForgot">Resend code</a>
                </div>
              </form>

              <!-- Step: forgot — new password (after a right code) -->
              <form v-else-if="step === 'forgotNew'" @submit.prevent="doReset">
                <div class="cc-steps">
                  <span class="done"><v-icon icon="mdi-check" size="14" /> Code</span>
                  <span class="line done" />
                  <span class="on">2 · New password</span>
                </div>
                <div class="cc-verified">
                  <v-icon icon="mdi-shield-check" size="22" />
                  <div>
                    <b>Code verified</b>
                    <div class="text-caption">Now choose a new password for <b>{{ name }}</b>.</div>
                  </div>
                </div>
                <h2 class="cc-h1">New password</h2>
                <label class="cc-label">New password</label>
                <v-text-field
                  v-model="resetPw"
                  :type="showPw ? 'text' : 'password'"
                  :maxlength="PASSWORD_MAX"
                  prepend-inner-icon="mdi-lock-outline"
                  :append-inner-icon="showPw ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                  variant="solo-filled"
                  flat
                  rounded="lg"
                  hide-details
                  autofocus
                  autocomplete="new-password"
                  @click:append-inner="showPw = !showPw"
                />
                <ul class="pw-rules">
                  <li v-for="c in passwordChecks(resetPw)" :key="c.label" :class="{ ok: c.ok }">
                    <v-icon :icon="c.ok ? 'mdi-check-circle' : 'mdi-circle-outline'" size="16" />{{ c.label }}
                  </li>
                </ul>
                <label class="cc-label">Confirm new password</label>
                <v-text-field
                  v-model="resetPw2"
                  :type="showPw ? 'text' : 'password'"
                  :maxlength="PASSWORD_MAX"
                  prepend-inner-icon="mdi-lock-check-outline"
                  variant="solo-filled"
                  flat
                  rounded="lg"
                  autocomplete="new-password"
                  :error-messages="resetPw2 && !pwMatch ? 'The two passwords are not the same' : ''"
                  :hide-details="!resetPw2 || pwMatch"
                />
                <v-btn
                  type="submit"
                  color="primary"
                  block
                  size="x-large"
                  rounded="lg"
                  :loading="loading"
                  :disabled="!passwordOk(resetPw) || !pwMatch"
                  class="mt-3 text-none text-black font-weight-bold"
                >
                  Save new password
                </v-btn>
                <div class="text-center mt-5 text-body-2">
                  <a href="#" class="cc-link" @click.prevent="go('password')">← Back to sign in</a>
                </div>
              </form>
            </div>
          </Transition>
        </div>
      </section>
    </div>
  </v-main>
</template>

<style scoped>
.cc-page {
  min-height: 100vh;
  background: rgb(var(--v-theme-background));
}
.cc-grid {
  display: grid;
  grid-template-columns: 1fr;
  min-height: 100vh;
}
@media (min-width: 960px) {
  .cc-grid {
    grid-template-columns: 1.1fr 1fr;
  }
}

/* ── brand panel (MyTPlus yellow) ── */
.cc-brand {
  position: relative;
  overflow: hidden;
  flex-direction: column;
  justify-content: space-between;
  padding: 44px 56px;
  color: #1a1a1a;
  background: linear-gradient(135deg, #fcd021 0%, #ffb300 100%);
}
.cc-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(10px);
  pointer-events: none;
}
.cc-glow--1 {
  width: 520px;
  height: 520px;
  right: -180px;
  top: -160px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.55), transparent 65%);
}
.cc-glow--2 {
  width: 420px;
  height: 420px;
  left: -160px;
  bottom: -180px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.32), transparent 65%);
}
.cc-badge {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 8px 20px rgba(120, 80, 0, 0.18);
}
.cc-badge--sm {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: linear-gradient(135deg, #fcd021, #ffb300);
}
.cc-copy {
  position: relative;
  max-width: 520px;
}
.cc-brand-title {
  font-size: 2.6rem;
  line-height: 1.12;
  font-weight: 900;
  letter-spacing: -0.02em;
  margin-bottom: 14px;
}
.cc-brand-sub {
  font-size: 1.05rem;
  opacity: 0.82;
  margin-bottom: 30px;
}
.cc-feature-card {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(8px);
  border-radius: 20px;
  padding: 10px 20px;
  box-shadow: 0 20px 40px rgba(120, 80, 0, 0.18);
  max-width: 440px;
}
.cc-feature {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  opacity: 0;
  animation: cc-in 0.5s ease forwards;
}
.cc-feature + .cc-feature {
  border-top: 1px solid rgba(0, 0, 0, 0.07);
}
.cc-feature-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: linear-gradient(135deg, #fcd021, #ffb300);
}
@keyframes cc-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.cc-brand-stats {
  position: relative;
}

/* ── form side ── */
.cc-form-side {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  background: rgb(var(--v-theme-surface));
}
.cc-form-wrap {
  width: 100%;
  max-width: 400px;
}
.cc-h1 {
  font-size: 2rem;
  font-weight: 900;
  letter-spacing: -0.02em;
  margin-bottom: 4px;
}
.cc-lead {
  font-size: 0.98rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin-bottom: 26px;
}
.cc-label {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 6px;
}
.cc-link {
  color: #b45309;
  font-weight: 700;
  text-decoration: none;
}
.cc-link:hover {
  text-decoration: underline;
}
.cc-otp :deep(.v-otp-input__content) {
  padding-inline: 0;
  max-width: 100%;
}
.cc-foot {
  margin-top: 26px;
  padding-top: 18px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  text-align: center;
  font-size: 0.85rem;
}

/* ── animations ── */
/* smooth step changes (password → OTP → …) */
.cc-step-enter-active,
.cc-step-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.cc-step-enter-from {
  opacity: 0;
  transform: translateY(16px);
}
.cc-step-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}

/* card rises in on load */
.cc-form-wrap {
  animation: cc-rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes cc-rise {
  from {
    opacity: 0;
    transform: translateY(26px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* gentle moving gradient on the brand panel */
.cc-brand {
  background-size: 200% 200%;
  animation: cc-grad 16s ease infinite;
}
@keyframes cc-grad {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

/* floating logo + slow-breathing glows */
.cc-brand .cc-badge {
  animation: cc-float 4.5s ease-in-out infinite;
}
@keyframes cc-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}
.cc-glow {
  animation: cc-breathe 9s ease-in-out infinite;
}
.cc-glow--2 {
  animation-delay: 3s;
}
@keyframes cc-breathe {
  0%,
  100% {
    opacity: 0.85;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.12);
  }
}

/* brand copy eases in */
.cc-brand-title {
  animation: cc-rise 0.7s 0.1s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.cc-brand-sub {
  animation: cc-rise 0.7s 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* buttons lift on hover */
.cc-form-wrap :deep(.v-btn) {
  transition:
    transform 0.18s ease,
    box-shadow 0.22s ease,
    filter 0.18s ease;
}
.cc-form-wrap :deep(.v-btn.bg-primary:hover) {
  transform: translateY(-2px);
  box-shadow: 0 12px 24px rgba(255, 179, 0, 0.35);
  filter: brightness(1.03);
}
.cc-link {
  transition: color 0.15s ease;
}

@media (prefers-reduced-motion: reduce) {
  .cc-step-enter-active,
  .cc-step-leave-active,
  .cc-form-wrap,
  .cc-brand,
  .cc-brand .cc-badge,
  .cc-glow,
  .cc-brand-title,
  .cc-brand-sub,
  .cc-feature {
    animation: none !important;
    transition: none !important;
  }
}
.cc-steps {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
  font-size: 0.78rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.45);
}
.cc-steps .on {
  color: rgb(var(--v-theme-on-surface));
}
.cc-steps .done {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: #16a34a;
}
.cc-steps .line {
  flex: 0 0 36px;
  height: 2px;
  border-radius: 2px;
  background: rgba(var(--v-theme-on-surface), 0.15);
}
.cc-steps .line.done {
  background: #16a34a;
}
.cc-otp-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 22px;
  margin-top: 6px;
  font-size: 0.82rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.cc-otp--error :deep(.v-field) {
  animation: cc-shake 0.35s;
}
@keyframes cc-shake {
  25% {
    transform: translateX(-5px);
  }
  75% {
    transform: translateX(5px);
  }
}
.cc-verified {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  padding: 12px 14px;
  border-radius: 14px;
  color: #166534;
  background: rgba(22, 163, 74, 0.1);
  border: 1px solid rgba(22, 163, 74, 0.25);
}
.pw-rules {
  list-style: none;
  padding: 0;
  margin: 10px 0 4px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 12px;
  font-size: 0.8rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.pw-rules li {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pw-rules li.ok {
  color: rgb(var(--v-theme-success));
}
</style>
