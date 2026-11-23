<script setup lang="ts">
import type { OtpChallenge } from '~/composables/useAuth'

/**
 * CCare staff portal sign-in: password → one-time SMS code. Also register a new
 * account and reset a forgotten password (both by SMS code). Separate from the
 * MyTPlus admin login, with its own "My CCare" identity.
 */
definePageMeta({ layout: false })
useHead({ title: 'My CCare — Sign in' })

const { ccareStart, ccareVerify, ccareForgot, ccareReset, ccareRegister, ccareConfig } = useAuth()
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

type Step = 'password' | 'otp' | 'register' | 'forgotName' | 'forgotOtp'
const step = ref<Step>('password')
const loading = ref(false)
const error = ref('')
const notice = ref(route.query.reason === 'idle' ? 'You were signed out. Please sign in again.' : '')

const name = ref((route.query.name as string) || '')
const password = ref('')
const showPw = ref(false)

const challenge = ref<OtpChallenge | null>(null)
const code = ref('')
const resetPw = ref('')

// Register fields.
const reg = reactive({ name: '', password: '', nameLa: '', staffId: '', staffTel: '', division: '' })

function go(to: Step) {
  step.value = to
  error.value = ''
}

async function run(fn: () => Promise<void>) {
  loading.value = true
  error.value = ''
  try {
    await fn()
  } catch (e) {
    error.value = errorMessage(e, 'Something went wrong. Please try again.')
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
    await navigateTo('/ccare')
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

const doReset = () =>
  run(async () => {
    await ccareReset(challenge.value!.challenge, code.value.trim(), resetPw.value)
    notice.value = 'Password changed. Please sign in.'
    password.value = ''
    go('password')
  })
</script>

<template>
  <div class="cc">
    <div class="cc-card">
      <div class="cc-head">
        <div class="cc-logo"><v-icon icon="mdi-headset" size="30" /></div>
        <div>
          <div class="cc-title">My CCare</div>
          <div class="cc-sub">Customer Care portal</div>
        </div>
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
      <v-alert v-if="error" type="error" variant="tonal" density="compact" rounded="lg" class="mb-4" :text="error" />

      <!-- Step: password -->
      <form v-if="step === 'password'" @submit.prevent="startLogin">
        <h1 class="cc-h1">Sign in</h1>
        <p class="cc-p">Enter your staff login. We'll text a one-time code to your phone.</p>
        <label class="cc-label">Login name</label>
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
          color="#0d9488"
          block
          size="large"
          rounded="lg"
          :loading="loading"
          :disabled="!name || !password"
          class="mt-3 text-none font-weight-bold"
          append-icon="mdi-arrow-right"
        >
          Continue
        </v-btn>
        <div v-if="canReset || canRegister" class="d-flex justify-space-between mt-4 text-body-2">
          <a v-if="canReset" href="#" class="cc-link" @click.prevent="go('forgotName')">Forgot password?</a>
          <span v-else />
          <a v-if="canRegister" href="#" class="cc-link" @click.prevent="go('register')">Create account</a>
        </div>
      </form>

      <!-- Step: OTP -->
      <form v-else-if="step === 'otp'" @submit.prevent="verify">
        <h1 class="cc-h1">Enter code</h1>
        <p class="cc-p">
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
        <v-otp-input v-model="code" :length="challenge?.length ?? 6" type="number" class="cc-otp" @finish="verify" />
        <v-btn
          type="submit"
          color="#0d9488"
          block
          size="large"
          rounded="lg"
          :loading="loading"
          :disabled="code.length < (challenge?.length ?? 6)"
          class="mt-3 text-none font-weight-bold"
        >
          Verify &amp; sign in
        </v-btn>
        <div class="d-flex justify-space-between mt-4 text-body-2">
          <a href="#" class="cc-link" @click.prevent="go('password')">← Back</a>
          <a href="#" class="cc-link" @click.prevent="resend">Resend code</a>
        </div>
      </form>

      <!-- Step: register -->
      <form v-else-if="step === 'register'" @submit.prevent="doRegister">
        <h1 class="cc-h1">Create account</h1>
        <p class="cc-p">Register a new CCare staff account.</p>
        <label class="cc-label">Login name</label>
        <v-text-field v-model="reg.name" variant="solo-filled" flat rounded="lg" density="comfortable" class="mb-1" />
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
          color="#0d9488"
          block
          size="large"
          rounded="lg"
          :loading="loading"
          :disabled="!reg.name || reg.password.length < 4"
          class="mt-2 text-none font-weight-bold"
        >
          Create account
        </v-btn>
        <div class="text-center mt-4 text-body-2">
          <a href="#" class="cc-link" @click.prevent="go('password')">← Back to sign in</a>
        </div>
      </form>

      <!-- Step: forgot — name -->
      <form v-else-if="step === 'forgotName'" @submit.prevent="startForgot">
        <h1 class="cc-h1">Reset password</h1>
        <p class="cc-p">Enter your login name. We'll text a code to the phone on file.</p>
        <label class="cc-label">Login name</label>
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
          color="#0d9488"
          block
          size="large"
          rounded="lg"
          :loading="loading"
          :disabled="!name"
          class="mt-3 text-none font-weight-bold"
        >
          Send code
        </v-btn>
        <div class="text-center mt-4 text-body-2">
          <a href="#" class="cc-link" @click.prevent="go('password')">← Back to sign in</a>
        </div>
      </form>

      <!-- Step: forgot — OTP + new password -->
      <form v-else-if="step === 'forgotOtp'" @submit.prevent="doReset">
        <h1 class="cc-h1">New password</h1>
        <p class="cc-p">
          Enter the code sent to <b>{{ challenge?.phoneHint }}</b> and your new password.
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
        <label class="cc-label">Code</label>
        <v-otp-input v-model="code" :length="challenge?.length ?? 6" type="number" class="cc-otp mb-2" />
        <label class="cc-label">New password</label>
        <v-text-field
          v-model="resetPw"
          type="text"
          variant="solo-filled"
          flat
          rounded="lg"
          hint="At least 4 characters"
        />
        <v-btn
          type="submit"
          color="#0d9488"
          block
          size="large"
          rounded="lg"
          :loading="loading"
          :disabled="code.length < (challenge?.length ?? 6) || resetPw.length < 4"
          class="mt-3 text-none font-weight-bold"
        >
          Change password
        </v-btn>
        <div class="text-center mt-4 text-body-2">
          <a href="#" class="cc-link" @click.prevent="go('password')">← Back to sign in</a>
        </div>
      </form>

      <div class="cc-foot">
        <NuxtLink to="/login" class="cc-link">MyTPlus admin? Sign in here</NuxtLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cc {
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px 16px;
  background:
    radial-gradient(1200px 600px at 10% -10%, rgba(255, 255, 255, 0.18), transparent 60%),
    linear-gradient(135deg, #0f766e 0%, #0b5e73 55%, #0a4d68 100%);
}
.cc-card {
  width: 100%;
  max-width: 440px;
  background: rgb(var(--v-theme-surface));
  border-radius: 22px;
  padding: 30px 28px 22px;
  box-shadow: 0 30px 70px rgba(0, 0, 0, 0.35);
}
.cc-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 22px;
}
.cc-logo {
  width: 52px;
  height: 52px;
  border-radius: 15px;
  display: grid;
  place-items: center;
  color: #fff;
  background: linear-gradient(135deg, #14b8a6, #0d9488);
  box-shadow: 0 8px 20px rgba(13, 148, 136, 0.4);
}
.cc-title {
  font-size: 1.35rem;
  font-weight: 900;
  letter-spacing: -0.01em;
}
.cc-sub {
  font-size: 0.8rem;
  opacity: 0.6;
}
.cc-h1 {
  font-size: 1.5rem;
  font-weight: 800;
  margin-bottom: 4px;
}
.cc-p {
  font-size: 0.92rem;
  opacity: 0.7;
  margin-bottom: 18px;
}
.cc-label {
  display: block;
  font-size: 0.82rem;
  font-weight: 600;
  margin-bottom: 5px;
}
.cc-link {
  color: #0d9488;
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
  margin-top: 22px;
  padding-top: 16px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  text-align: center;
  font-size: 0.85rem;
}
</style>
