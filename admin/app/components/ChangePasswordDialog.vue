<script setup lang="ts">
const model = defineModel<boolean>({ default: false })
const api = useApi()
const current = ref('')
const next = ref('')
const confirm = ref('')
const show = ref(false)
const saving = ref(false)
const error = ref('')
const done = ref(false)

watch(model, (open) => {
  if (open) {
    current.value = next.value = confirm.value = ''
    error.value = ''
    done.value = false
  }
})

async function save() {
  error.value = ''
  if (next.value.length < 8) return (error.value = 'New password must be at least 8 characters')
  if (next.value !== confirm.value) return (error.value = 'The new passwords do not match')
  saving.value = true
  try {
    await api('/auth/password', { method: 'POST', body: { currentPassword: current.value, newPassword: next.value } })
    done.value = true
    setTimeout(() => (model.value = false), 1200)
  } catch (e: any) {
    error.value = e?.data?.message || 'Could not change password'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <v-dialog v-model="model" max-width="440">
    <v-card rounded="xl">
      <v-card-item prepend-icon="mdi-lock-reset">
        <v-card-title class="font-weight-bold">Change my password</v-card-title>
      </v-card-item>
      <v-card-text>
        <v-form @submit.prevent="save">
          <v-text-field v-model="current" label="Current password" :type="show ? 'text' : 'password'" autocomplete="current-password" />
          <v-text-field v-model="next" label="New password" :type="show ? 'text' : 'password'" autocomplete="new-password" hint="At least 8 characters" />
          <v-text-field v-model="confirm" label="Repeat new password" :type="show ? 'text' : 'password'" autocomplete="new-password" />
          <v-checkbox v-model="show" label="Show passwords" density="compact" hide-details />
          <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-2" :text="error" />
          <v-alert v-if="done" type="success" variant="tonal" density="compact" class="mt-2" text="Password changed" />
        </v-form>
      </v-card-text>
      <v-card-actions class="pa-4 pt-0">
        <v-spacer />
        <v-btn variant="text" class="text-none" @click="model = false">Cancel</v-btn>
        <v-btn color="secondary" variant="flat" class="text-none" :loading="saving" @click="save">Change password</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
