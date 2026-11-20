<script setup lang="ts">
interface Account {
  id: number
  username: string
  displayName: string | null
  role: 'admin' | 'viewer'
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

const api = useApi()
const { admin: me } = useAuth()
if (me.value?.role !== 'admin') await navigateTo('/')

const { data: accounts, pending, refresh, error } = await useAsyncData('accounts', () => api<Account[]>('/accounts'))

const ROLE_OPTIONS = [
  { title: 'Administrator: full access, can manage accounts', value: 'admin' },
  { title: 'Viewer: can look, cannot change anything', value: 'viewer' },
]

// ── create / edit dialog ──
const dialog = ref(false)
const editing = ref<Account | null>(null)
const form = reactive({ username: '', displayName: '', role: 'viewer' as 'admin' | 'viewer', isActive: true, password: '' })
const showPw = ref(false)
const saving = ref(false)
const formError = ref('')

function openCreate() {
  editing.value = null
  Object.assign(form, { username: '', displayName: '', role: 'viewer', isActive: true, password: '' })
  formError.value = ''
  dialog.value = true
}
function openEdit(a: Account) {
  editing.value = a
  Object.assign(form, { username: a.username, displayName: a.displayName ?? '', role: a.role, isActive: a.isActive, password: '' })
  formError.value = ''
  dialog.value = true
}
function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  form.password = Array.from(bytes, (b) => chars[b % chars.length]).join('')
  showPw.value = true
}

const rules = {
  username: (v: string) => /^[a-zA-Z0-9._-]{3,60}$/.test(v) || '3+ characters: letters, numbers, . _ -',
  password: (v: string) => (!v && !!editing.value) || v.length >= 8 || 'At least 8 characters',
}

async function save() {
  formError.value = ''
  if (rules.username(form.username) !== true || rules.password(form.password) !== true) {
    formError.value = 'Please fix the highlighted fields'
    return
  }
  saving.value = true
  try {
    const body: Record<string, unknown> = {
      username: form.username.trim(),
      displayName: form.displayName.trim() || null,
      role: form.role,
      isActive: form.isActive,
    }
    if (form.password) body.password = form.password
    if (editing.value) await api(`/accounts/${editing.value.id}`, { method: 'PATCH', body })
    else await api('/accounts', { method: 'POST', body })
    dialog.value = false
    toast(editing.value ? 'Account updated' : `Account "${form.username}" created`)
    await refresh()
  } catch (e: any) {
    formError.value = e?.data?.message || 'Could not save'
  } finally {
    saving.value = false
  }
}

// ── delete ──
const toDelete = ref<Account | null>(null)
const deleting = ref(false)
async function confirmDelete() {
  if (!toDelete.value) return
  deleting.value = true
  try {
    await api(`/accounts/${toDelete.value.id}`, { method: 'DELETE' })
    toast(`Account "${toDelete.value.username}" deleted`)
    toDelete.value = null
    await refresh()
  } catch (e: any) {
    toast(e?.data?.message || 'Could not delete', 'error')
  } finally {
    deleting.value = false
  }
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
        <h1 class="page-title">Admin accounts</h1>
        <div class="text-body-2 text-medium-emphasis">Who can log in to this website</div>
      </div>
      <v-spacer />
      <v-btn color="primary" class="text-black text-none" prepend-icon="mdi-account-plus" @click="openCreate">
        New account
      </v-btn>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4" :text="error.data?.message || 'Could not load accounts'" />

    <v-card class="bordered">
      <v-table hover>
        <thead>
          <tr>
            <th>Account</th>
            <th>Role</th>
            <th>Status</th>
            <th>Last login</th>
            <th>Created</th>
            <th class="text-end" style="width: 120px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in accounts ?? []" :key="a.id">
            <td class="py-2">
              <div class="d-flex align-center ga-3">
                <v-avatar :color="a.role === 'admin' ? 'primary' : 'grey'" variant="tonal" size="36">
                  <span class="font-weight-bold">{{ (a.displayName || a.username)[0]?.toUpperCase() }}</span>
                </v-avatar>
                <div>
                  <div class="font-weight-medium">
                    {{ a.displayName || a.username }}
                    <v-chip v-if="a.id === me?.id" size="x-small" class="ml-1" variant="outlined">you</v-chip>
                  </div>
                  <div class="text-caption text-medium-emphasis text-mono">{{ a.username }}</div>
                </div>
              </div>
            </td>
            <td>
              <v-chip size="small" :color="a.role === 'admin' ? 'primary' : undefined" variant="tonal"
                :prepend-icon="a.role === 'admin' ? 'mdi-shield-crown-outline' : 'mdi-eye-outline'">
                {{ a.role === 'admin' ? 'Administrator' : 'Viewer' }}
              </v-chip>
            </td>
            <td>
              <v-chip size="small" :color="a.isActive ? 'success' : 'error'" variant="tonal">
                {{ a.isActive ? 'Active' : 'Disabled' }}
              </v-chip>
            </td>
            <td>{{ a.lastLoginAt ? timeAgo(a.lastLoginAt) : 'Never' }}</td>
            <td>{{ formatDateTime(a.createdAt) }}</td>
            <td class="text-end">
              <v-btn icon="mdi-pencil-outline" variant="text" size="small" title="Edit" @click="openEdit(a)" />
              <v-btn
                icon="mdi-delete-outline"
                variant="text"
                size="small"
                color="error"
                title="Delete"
                :disabled="a.id === me?.id"
                @click="toDelete = a"
              />
            </td>
          </tr>
          <tr v-if="pending && !accounts">
            <td colspan="6" class="text-center py-8"><v-progress-circular indeterminate color="primary" /></td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <!-- create / edit -->
    <v-dialog v-model="dialog" max-width="520">
      <v-card rounded="xl">
        <v-card-item :prepend-icon="editing ? 'mdi-account-edit-outline' : 'mdi-account-plus-outline'">
          <v-card-title class="font-weight-bold">{{ editing ? 'Edit account' : 'New account' }}</v-card-title>
          <v-card-subtitle>{{ editing ? editing.username : 'They log in with this username and password' }}</v-card-subtitle>
        </v-card-item>
        <v-card-text>
          <v-form @submit.prevent="save">
            <v-text-field v-model="form.displayName" label="Full name" prepend-inner-icon="mdi-badge-account-outline" />
            <v-text-field v-model="form.username" label="Username" prepend-inner-icon="mdi-account-outline" :rules="[rules.username]" autocomplete="off" />
            <v-text-field
              v-model="form.password"
              :label="editing ? 'New password (leave empty to keep)' : 'Password'"
              prepend-inner-icon="mdi-lock-outline"
              :type="showPw ? 'text' : 'password'"
              :rules="[rules.password]"
              autocomplete="new-password"
            >
              <template #append-inner>
                <v-icon :icon="showPw ? 'mdi-eye-off-outline' : 'mdi-eye-outline'" class="mr-1" @click="showPw = !showPw" />
                <v-btn size="x-small" variant="tonal" class="text-none" @click="generatePassword">Generate</v-btn>
              </template>
            </v-text-field>
            <v-select v-model="form.role" :items="ROLE_OPTIONS" label="Role" prepend-inner-icon="mdi-shield-account-outline" />
            <v-switch
              v-model="form.isActive"
              color="success"
              inset
              hide-details
              :label="form.isActive ? 'Active: can log in' : 'Disabled: cannot log in'"
            />
            <v-alert v-if="formError" type="error" variant="tonal" density="compact" class="mt-3" :text="formError" />
            <v-alert v-if="form.password && showPw" type="info" variant="tonal" density="compact" class="mt-3">
              Copy this password now and give it to the person; it won't be shown again.
            </v-alert>
          </v-form>
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn variant="text" class="text-none" @click="dialog = false">Cancel</v-btn>
          <v-btn color="secondary" variant="flat" class="text-none" :loading="saving" @click="save">
            {{ editing ? 'Save changes' : 'Create account' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- delete -->
    <v-dialog :model-value="!!toDelete" max-width="420" @update:model-value="(v) => !v && (toDelete = null)">
      <v-card rounded="xl">
        <v-card-item prepend-icon="mdi-alert-outline">
          <v-card-title class="font-weight-bold">Delete account?</v-card-title>
        </v-card-item>
        <v-card-text>
          <strong>{{ toDelete?.displayName || toDelete?.username }}</strong> will no longer be able to log in. This can't be undone.
          To block someone temporarily, edit the account and switch it to Disabled instead.
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn variant="text" class="text-none" @click="toDelete = null">Cancel</v-btn>
          <v-btn color="error" variant="flat" class="text-none" :loading="deleting" @click="confirmDelete">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="3000" location="bottom right">{{ snack.text }}</v-snackbar>
  </div>
</template>
