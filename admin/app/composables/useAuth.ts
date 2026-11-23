import type { AdminInfo } from '~/types/api'

/** Admin login state, kept in cookies so it survives a page reload. */
export function useAuth() {
  const token = useCookie<string | null>('admin_token', { sameSite: 'strict', maxAge: 60 * 60 * 12 })
  const admin = useCookie<AdminInfo | null>('admin_info', { sameSite: 'strict', maxAge: 60 * 60 * 12 })
  const config = useRuntimeConfig()

  async function login(username: string, password: string) {
    const res = await $fetch<{ token: string; admin: AdminInfo }>('/api/v1/admin/auth/login', {
      baseURL: config.public.apiBase,
      method: 'POST',
      body: { username, password },
    })
    token.value = res.token
    admin.value = res.admin
    // A new sign-in starts the 10-minute idle timer fresh (else an old time would log out at once).
    resetIdleTimer()
  }

  /** `reason: 'idle'` shows a "signed out after 10 minutes" note on the login page. */
  function logout(reason?: 'idle') {
    disconnectLive()
    token.value = null
    admin.value = null
    return navigateTo(reason === 'idle' ? '/login?reason=idle' : '/login')
  }

  return { token, admin, login, logout, isLoggedIn: computed(() => !!token.value) }
}
