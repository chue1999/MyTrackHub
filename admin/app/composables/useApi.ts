/** $fetch for the admin API: adds the token and sends you to /login on 401. */
export function useApi() {
  const config = useRuntimeConfig()
  const { token, logout } = useAuth()

  return $fetch.create({
    baseURL: `${config.public.apiBase}/api/v1/admin`,
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
