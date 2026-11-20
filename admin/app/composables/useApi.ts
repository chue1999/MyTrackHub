/** $fetch for the admin API: adds the token and sends you to /login on 401. */
export function useApi() {
  const config = useRuntimeConfig()
  const { token, logout } = useAuth()

  return $fetch.create({
    baseURL: `${config.public.apiBase}/api/admin`,
    onRequest({ options }) {
      if (token.value) {
        const headers = new Headers(options.headers as HeadersInit)
        headers.set('Authorization', `Bearer ${token.value}`)
        options.headers = headers
      }
    },
    onResponseError({ response }) {
      if (response.status === 401) logout()
    },
  })
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface AppUser {
  id: string
  msisdn: string
  firstName: string | null
  lastName: string | null
  platform: string | null
  appVersion: string | null
  deviceModel: string | null
  loginCount: number
  firstSeenAt: string
  lastSeenAt: string
  lastLoginAt: string | null
  note?: string | null
}

export interface TrackedEvent {
  id: string
  userId: string | null
  msisdn: string | null
  sessionId: string | null
  type: 'login' | 'logout' | 'screen_view' | 'tap' | 'action' | 'api' | 'error'
  name: string
  screen: string | null
  properties: Record<string, unknown>
  success: boolean | null
  result: string | null
  platform: string | null
  appVersion: string | null
  deviceModel: string | null
  occurredAt: string
  user?: Pick<AppUser, 'id' | 'msisdn' | 'firstName' | 'lastName'> | null
}
