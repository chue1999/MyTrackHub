<script setup lang="ts">
import type { CcareUser } from '~/types/api'

/**
 * CCare staff accounts (Tb_User_detail — the same login as the My CCare web).
 * Everyone logged in can view; a CCare administrator or a MyTPlus admin can add,
 * edit, reset passwords and close/reopen accounts.
 */
useHead({ title: 'CCare accounts' })
const api = useApi()
const { admin: me } = useAuth()
const canManage = computed(() => me.value?.role === 'admin' || me.value?.canManage === true)

const search = ref('')
const { data, pending, refresh, error } = await useAsyncData(
  'ccare-users',
  () => api<CcareUser[]>('/ccare/users', { query: { search: search.value || undefined } }),
  { watch: [] },
)
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => refresh(), 300)
})
const users = computed(() => data.value ?? [])
const stats = computed(() => {
  const list = users.value
  return [
    { label: 'Staff', value: list.length, icon: 'mdi-account-group-outline', tone: 'teal' },
    { label: 'Active', value: list.filter((u) => u.active).length, icon: 'mdi-account-check-outline', tone: 'green' },
    {
      label: 'CCare admins',
      value: list.filter((u) => u.canManage).length,
      icon: 'mdi-shield-crown-outline',
      tone: 'amber',
    },
    { label: 'Closed', value: list.filter((u) => !u.active).length, icon: 'mdi-account-cancel-outline', tone: 'red' },
  ]
})

// ── create / edit ──
const dialog = ref(false)
const editing = ref<CcareUser | null>(null)
const form = reactive({
  name: '',
  password: '',
  nameLa: '',
  staffId: '',
  staffTel: '',
  division: '',
  position: '',
  brandId: '',
  descrip: 'user' as 'user' | 'Admin',
})
const showPw = ref(false)
const saving = ref(false)
const formError = ref('')

function openCreate() {
  editing.value = null
  Object.assign(form, {
    name: '',
    password: '',
    nameLa: '',
    staffId: '',
    staffTel: '',
    division: '',
    position: '',
    brandId: '',
    descrip: 'user',
  })
  formError.value = ''
  showPw.value = false
  dialog.value = true
}
function openEdit(u: CcareUser) {
  editing.value = u
  Object.assign(form, {
    name: u.name,
    password: '',
    nameLa: u.nameLa ?? '',
    staffId: u.staffId ?? '',
    staffTel: u.staffTel ?? '',
    division: u.division ?? '',
    position: u.position ?? '',
    brandId: u.brandId ?? '',
    descrip: (u.descrip || '').toLowerCase() === 'admin' ? 'Admin' : 'user',
  })
  formError.value = ''
  dialog.value = true
}

async function save() {
  formError.value = ''
  if (!editing.value && form.name.trim().length < 1) {
    formError.value = 'Enter a login name'
    return
  }
  if (!editing.value && form.password.length < 4) {
    formError.value = 'Password must be at least 4 characters'
    return
  }
  saving.value = true
  try {
    const body: Record<string, unknown> = {
      nameLa: form.nameLa.trim() || null,
      staffId: form.staffId.trim() || null,
      staffTel: form.staffTel.trim() || null,
      division: form.division.trim() || null,
      position: form.position.trim() || null,
      brandId: form.brandId.trim() || null,
      descrip: form.descrip,
    }
    if (editing.value) {
      await api(`/ccare/users/${editing.value.id}`, { method: 'PATCH', body })
      toast('Account updated')
    } else {
      body.name = form.name.trim()
      body.password = form.password
      await api('/ccare/users', { method: 'POST', body })
      toast(`Account "${form.name.trim()}" created`)
    }
    dialog.value = false
    await refresh()
  } catch (e) {
    formError.value = errorMessage(e, 'Could not save')
  } finally {
    saving.value = false
  }
}

// ── reset password ──
const pwTarget = ref<CcareUser | null>(null)
const newPw = ref('')
const resetting = ref(false)
function openReset(u: CcareUser) {
  pwTarget.value = u
  newPw.value = ''
}
async function doReset() {
  if (!pwTarget.value || newPw.value.length < 4) return
  resetting.value = true
  try {
    await api(`/ccare/users/${pwTarget.value.id}/password`, { method: 'POST', body: { newPassword: newPw.value } })
    toast(`Password reset for "${pwTarget.value.name}"`)
    pwTarget.value = null
    await refresh()
  } catch (e) {
    toast(errorMessage(e, 'Could not reset'), 'error')
  } finally {
    resetting.value = false
  }
}

// ── close / reopen ──
async function toggleActive(u: CcareUser) {
  try {
    await api(`/ccare/users/${u.id}/active`, { method: 'POST', body: { active: !u.active } })
    toast(u.active ? `"${u.name}" closed` : `"${u.name}" reopened`)
    await refresh()
  } catch (e) {
    toast(errorMessage(e, 'Could not change'), 'error')
  }
}

function randomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  form.password = Array.from(bytes, (b) => chars[b % chars.length]).join('')
  showPw.value = true
}

// ── toast ──
const snack = reactive({ show: false, text: '', color: 'success' })
function toast(text: string, color = 'success') {
  Object.assign(snack, { show: true, text, color })
}
</script>

<template>
  <div>
    <div class="d-flex flex-wrap align-center ga-3 mb-6">
      <div>
        <h1 class="page-title">CCare accounts</h1>
        <div class="text-body-2 text-medium-emphasis">Staff who can log in to My CCare</div>
      </div>
      <v-spacer />
      <v-text-field
        v-model="search"
        density="compact"
        variant="solo-filled"
        flat
        rounded="lg"
        hide-details
        clearable
        prepend-inner-icon="mdi-magnify"
        placeholder="Search name, staff ID, division…"
        style="max-width: 320px"
      />
      <v-btn
        v-if="canManage"
        color="primary"
        class="text-black text-none"
        prepend-icon="mdi-account-plus"
        @click="openCreate"
      >
        New account
      </v-btn>
    </div>

    <div class="cc-tiles mb-5">
      <div v-for="s in stats" :key="s.label" class="cc-tile" :class="`tone-${s.tone}`">
        <div class="cc-tile-icon"><v-icon :icon="s.icon" size="20" /></div>
        <div>
          <div class="cc-tile-value">{{ s.value.toLocaleString() }}</div>
          <div class="cc-tile-label">{{ s.label }}</div>
        </div>
      </div>
    </div>

    <v-alert
      v-if="error"
      type="error"
      variant="tonal"
      class="mb-4"
      :text="errorMessage(error, 'Could not load CCare accounts')"
    />

    <v-card class="bordered">
      <v-table hover>
        <thead>
          <tr>
            <th>Staff</th>
            <th>Staff ID</th>
            <th>Division / Position</th>
            <th>Phone</th>
            <th>Role</th>
            <th>Status</th>
            <th v-if="canManage" class="text-end" style="width: 150px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id">
            <td class="py-2">
              <div class="d-flex align-center ga-3">
                <v-avatar :color="u.canManage ? 'primary' : 'grey'" variant="tonal" size="36">
                  <span class="font-weight-bold">{{ (u.nameLa || u.name)[0]?.toUpperCase() }}</span>
                </v-avatar>
                <div>
                  <div class="font-weight-medium">{{ u.nameLa || u.name }}</div>
                  <div class="text-caption text-medium-emphasis text-mono">{{ u.name }}</div>
                </div>
              </div>
            </td>
            <td class="text-mono">{{ u.staffId || '—' }}</td>
            <td>
              <div>{{ u.division || '—' }}</div>
              <div class="text-caption text-medium-emphasis">{{ u.position || '' }}</div>
            </td>
            <td class="text-mono">{{ u.staffTel || '—' }}</td>
            <td>
              <v-chip
                size="small"
                :color="u.canManage ? 'primary' : undefined"
                variant="tonal"
                :prepend-icon="u.canManage ? 'mdi-shield-crown-outline' : 'mdi-account-outline'"
              >
                {{ u.canManage ? 'CCare admin' : 'Staff' }}
              </v-chip>
            </td>
            <td>
              <v-chip size="small" :color="u.active ? 'success' : 'error'" variant="tonal">
                {{ u.active ? 'Active' : 'Closed' }}
              </v-chip>
            </td>
            <td v-if="canManage" class="text-end text-no-wrap">
              <v-btn icon="mdi-pencil-outline" variant="text" size="small" title="Edit" @click="openEdit(u)" />
              <v-btn icon="mdi-lock-reset" variant="text" size="small" title="Reset password" @click="openReset(u)" />
              <v-btn
                :icon="u.active ? 'mdi-account-cancel-outline' : 'mdi-account-check-outline'"
                variant="text"
                size="small"
                :color="u.active ? 'error' : 'success'"
                :title="u.active ? 'Close account' : 'Reopen account'"
                @click="toggleActive(u)"
              />
            </td>
          </tr>
          <tr v-if="pending && !users.length">
            <td :colspan="canManage ? 7 : 6" class="text-center py-8">
              <v-progress-circular indeterminate color="primary" />
            </td>
          </tr>
          <tr v-else-if="!users.length">
            <td :colspan="canManage ? 7 : 6" class="text-center py-8 text-medium-emphasis">No accounts found.</td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <!-- create / edit -->
    <v-dialog v-model="dialog" max-width="560">
      <v-card rounded="xl">
        <v-card-item :prepend-icon="editing ? 'mdi-account-edit-outline' : 'mdi-account-plus-outline'">
          <v-card-title class="font-weight-bold">{{ editing ? 'Edit account' : 'New CCare account' }}</v-card-title>
          <v-card-subtitle>{{ editing ? editing.name : 'Staff login for My CCare' }}</v-card-subtitle>
        </v-card-item>
        <v-card-text>
          <div class="d-flex ga-3">
            <v-text-field
              v-model="form.name"
              label="Login name"
              :disabled="!!editing"
              variant="outlined"
              density="comfortable"
              class="flex-grow-1"
            />
            <v-select
              v-model="form.descrip"
              :items="[
                { title: 'Staff', value: 'user' },
                { title: 'CCare admin', value: 'Admin' },
              ]"
              label="Role"
              variant="outlined"
              density="comfortable"
              style="max-width: 160px"
            />
          </div>
          <v-text-field
            v-if="!editing"
            v-model="form.password"
            label="Password"
            :type="showPw ? 'text' : 'password'"
            :append-inner-icon="showPw ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
            variant="outlined"
            density="comfortable"
            hint="Stored as md5, the same as My CCare"
            @click:append-inner="showPw = !showPw"
          >
            <template #append>
              <v-btn variant="tonal" class="text-none" @click="randomPassword">Generate</v-btn>
            </template>
          </v-text-field>
          <v-text-field v-model="form.nameLa" label="Name (Lao)" variant="outlined" density="comfortable" />
          <div class="d-flex ga-3">
            <v-text-field v-model="form.staffId" label="Staff ID" variant="outlined" density="comfortable" />
            <v-text-field v-model="form.staffTel" label="Phone" variant="outlined" density="comfortable" />
            <v-text-field
              v-model="form.brandId"
              label="Brand"
              maxlength="2"
              variant="outlined"
              density="comfortable"
              style="max-width: 100px"
            />
          </div>
          <div class="d-flex ga-3">
            <v-text-field v-model="form.division" label="Division" variant="outlined" density="comfortable" />
            <v-text-field v-model="form.position" label="Position" variant="outlined" density="comfortable" />
          </div>
          <v-alert v-if="formError" type="error" variant="tonal" density="compact" :text="formError" />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" class="text-none" @click="dialog = false">Cancel</v-btn>
          <v-btn color="primary" variant="flat" class="text-black text-none" :loading="saving" @click="save">
            {{ editing ? 'Save' : 'Create' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- reset password -->
    <v-dialog :model-value="!!pwTarget" max-width="420" @update:model-value="pwTarget = null">
      <v-card rounded="xl">
        <v-card-item prepend-icon="mdi-lock-reset">
          <v-card-title class="font-weight-bold">Reset password</v-card-title>
          <v-card-subtitle>{{ pwTarget?.nameLa || pwTarget?.name }}</v-card-subtitle>
        </v-card-item>
        <v-card-text>
          <v-text-field
            v-model="newPw"
            label="New password"
            type="text"
            variant="outlined"
            density="comfortable"
            autofocus
            hint="At least 4 characters. Reopens the account if it was closed."
            persistent-hint
          />
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" class="text-none" @click="pwTarget = null">Cancel</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            class="text-black text-none"
            :disabled="newPw.length < 4"
            :loading="resetting"
            @click="doReset"
          >
            Reset
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="2500" location="bottom">{{ snack.text }}</v-snackbar>
  </div>
</template>

<style scoped>
.cc-tiles {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}
@media (max-width: 860px) {
  .cc-tiles {
    grid-template-columns: repeat(2, 1fr);
  }
}
.cc-tile {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgb(var(--v-theme-surface));
}
.cc-tile-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: grid;
  place-items: center;
}
.cc-tile-value {
  font-size: 1.5rem;
  font-weight: 800;
  line-height: 1.1;
}
.cc-tile-label {
  font-size: 0.78rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.tone-teal .cc-tile-icon {
  background: rgba(13, 148, 136, 0.14);
  color: #0d9488;
}
.tone-green .cc-tile-icon {
  background: rgba(46, 158, 91, 0.14);
  color: #2e9e5b;
}
.tone-amber .cc-tile-icon {
  background: rgba(237, 161, 0, 0.16);
  color: #e09a00;
}
.tone-red .cc-tile-icon {
  background: rgba(217, 68, 58, 0.14);
  color: #d9443a;
}
</style>
