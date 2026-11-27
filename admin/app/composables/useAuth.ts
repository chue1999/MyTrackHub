import type { AdminInfo } from '~/types/api'

export interface OtpChallenge {
  challenge: string
  phoneHint: string
  length: number
  devCode?: string
  /** Sign-in only: when the password expires, and how many days are left. */
  passwordExpiresAt?: string | null
  passwordDaysLeft?: number | null
}

/** Admin login state, kept in cookies so it survives a page reload. */
export function useAuth() {
  const token = useCookie<string | null>('admin_token', { sameSite: 'strict', maxAge: 60 * 60 * 12 })
  const admin = useCookie<AdminInfo | null>('admin_info', { sameSite: 'strict', maxAge: 60 * 60 * 12 })
  // Remembers which portal this device last used, so a returning CCare member
  // lands on their own OTP page instead of the admin login (kept ~6 months).
  const lastKind = useCookie<'admin' | 'ccare' | null>('last_login_kind', {
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 180,
  })
  const config = useRuntimeConfig()
  const post = <T>(url: string, body: Record<string, unknown>) =>
    $fetch<T>(`/api/v1/admin${url}`, { baseURL: config.public.apiBase, method: 'POST', body })

  function setSession(res: { token: string; admin: AdminInfo }) {
    token.value = res.token
    admin.value = res.admin
    lastKind.value = res.admin.kind === 'ccare' ? 'ccare' : 'admin'
    // A new sign-in starts the 10-minute idle timer fresh (else an old time would log out at once).
    resetIdleTimer()
    return res.admin
  }

  /** MyTPlus admin sign-in (username + password). */
  async function login(username: string, password: string) {
    return setSession(await post('/auth/login', { username, password }))
  }

  // ── CCare staff: password → SMS code ──
  const ccareStart = (name: string, password: string) => post<OtpChallenge>('/auth/ccare/start', { name, password })
  async function ccareVerify(challenge: string, code: string) {
    return setSession(await post('/auth/ccare/verify', { challenge, code }))
  }
  const ccareForgot = (name: string) => post<OtpChallenge>('/auth/ccare/forgot', { name })
  // Forgot password: check the SMS code (→ ticket), then set the new password with the ticket.
  const ccareResetCheck = (challenge: string, code: string) =>
    post<{ ticket: string }>('/auth/ccare/reset/check', { challenge, code })
  const ccareReset = (ticket: string, newPassword: string) =>
    post('/auth/ccare/reset', { challenge: ticket, newPassword })
  const ccareRegister = (body: Record<string, unknown>) => post('/auth/ccare/register', body)
  const ccareConfig = () =>
    $fetch<{ mode: string; canRegister: boolean; canReset: boolean }>('/api/v1/admin/auth/ccare/config', {
      baseURL: config.public.apiBase,
    })

  /** `reason: 'idle'` shows a "signed out" note. CCare staff return to their own portal. */
  function logout(reason?: 'idle') {
    const wasCcare = admin.value?.kind === 'ccare'
    disconnectLive()
    token.value = null
    admin.value = null
    if (wasCcare) return navigateTo(reason === 'idle' ? '/ccare-login?reason=idle' : '/ccare-login')
    return navigateTo(reason === 'idle' ? '/login?reason=idle' : '/login')
  }

  return {
    token,
    admin,
    login,
    ccareStart,
    ccareVerify,
    ccareForgot,
    ccareReset,
    ccareResetCheck,
    ccareRegister,
    ccareConfig,
    logout,
    isLoggedIn: computed(() => !!token.value),
    isCcare: computed(() => admin.value?.kind === 'ccare'),
  }
}
