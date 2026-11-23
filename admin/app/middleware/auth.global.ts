const PUBLIC = ['/login', '/ccare-login']

export default defineNuxtRouteMiddleware((to) => {
  const { isLoggedIn, admin } = useAuth()
  const isCcare = admin.value?.kind === 'ccare'

  if (PUBLIC.includes(to.path)) {
    if (isLoggedIn.value) return navigateTo(isCcare ? '/ccare' : '/')
    return
  }
  if (!isLoggedIn.value) return navigateTo('/login')
  // CCare staff only have the CCare pages; keep them there.
  if (isCcare && to.path !== '/ccare' && !to.path.startsWith('/ccare-')) return navigateTo('/ccare')
})
