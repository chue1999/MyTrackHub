export default defineNuxtRouteMiddleware((to) => {
  const { isLoggedIn, admin } = useAuth()
  const isCcare = admin.value?.kind === 'ccare'
  const lastKind = useCookie('last_login_kind')

  if (to.path === '/login') {
    if (isLoggedIn.value) return navigateTo(isCcare ? '/ccare-vas' : '/')
    // A device that last signed in as CCare returns to the CCare portal (it needs
    // an OTP), unless the person explicitly asked for the admin login (?as=admin).
    if (lastKind.value === 'ccare' && to.query.as !== 'admin') return navigateTo('/ccare-login')
    return
  }
  if (to.path === '/ccare-login') {
    if (isLoggedIn.value) return navigateTo(isCcare ? '/ccare-vas' : '/')
    return
  }
  if (!isLoggedIn.value) return navigateTo('/login')
  // CCare staff only have the CCare + TPLUS service pages; keep them there.
  const ccareAllowed =
    to.path === '/ccare' || to.path.startsWith('/ccare-') || to.path.startsWith('/tplus-') || to.path === '/logs'
  if (isCcare && !ccareAllowed) return navigateTo('/ccare-vas')
})
