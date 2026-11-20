interface AdminInfo {
  id: number
  username: string
  displayName?: string | null
}

/** Admin login state, kept in cookies so it survives a page reload. */
export function useAuth() {
  const token = useCookie<string | null>('admin_token', { sameSite: 'strict', maxAge: 60 * 60 * 12 })
  const admin = useCookie<AdminInfo | null>('admin_info', { sameSite: 'strict', maxAge: 60 * 60 * 12 })
  const config = useRuntimeConfig()

  async function login(username: string, password: string) {
    const res = await $fetch<{ token: string; admin: AdminInfo }>('/api/admin/auth/login', {
      baseURL: config.public.apiBase,
      method: 'POST',
      body: { username, password },
    })
    token.value = res.token
    admin.value = res.admin
  }

  function logout() {
    disconnectLive()
    token.value = null
    admin.value = null
    return navigateTo('/login')
  }

  return { token, admin, login, logout, isLoggedIn: computed(() => !!token.value) }
}
