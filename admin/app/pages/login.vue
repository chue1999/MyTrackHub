<script setup lang="ts">
definePageMeta({ layout: false })

const { login } = useAuth()
const username = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')

async function submit() {
  if (!username.value || !password.value) return
  loading.value = true
  error.value = ''
  try {
    await login(username.value, password.value)
    await navigateTo('/')
  } catch (e: any) {
    error.value = e?.data?.message || 'Cannot reach the server'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <v-main class="d-flex align-center justify-center" style="min-height: 100vh">
    <v-card class="bordered pa-6 pa-sm-8" width="100%" max-width="420">
      <div class="d-flex flex-column align-center text-center mb-6">
        <v-avatar color="primary" rounded="xl" size="64" class="mb-4">
          <v-icon icon="mdi-chart-timeline-variant" size="34" color="black" />
        </v-avatar>
        <div class="text-h5 font-weight-bold">MyTPlus Activity</div>
        <div class="text-body-2 text-medium-emphasis">Log in to see who uses the app and what they do</div>
      </div>

      <v-form @submit.prevent="submit">
        <v-text-field
          v-model="username"
          label="Username"
          prepend-inner-icon="mdi-account-outline"
          autocomplete="username"
          autofocus
        />
        <v-text-field
          v-model="password"
          label="Password"
          prepend-inner-icon="mdi-lock-outline"
          :type="showPassword ? 'text' : 'password'"
          :append-inner-icon="showPassword ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
          autocomplete="current-password"
          @click:append-inner="showPassword = !showPassword"
        />
        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4" :text="error" />
        <v-btn type="submit" color="primary" block size="large" :loading="loading" class="text-black">
          Log in
        </v-btn>
      </v-form>
    </v-card>
  </v-main>
</template>
