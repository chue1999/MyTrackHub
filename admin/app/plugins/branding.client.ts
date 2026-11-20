// Loads the logo and names once and keeps the browser tab (icon + title) in step.
export default defineNuxtPlugin(() => {
  const { branding, load, favicon } = useBranding()
  load()
  // A getter, so the tab updates as soon as the name or logo changes.
  useHead(() => {
    const site = branding.value.title
    return {
      titleTemplate: (page?: string) => (page && page !== site ? `${page} · ${site}` : site),
      link: [{ key: 'favicon', rel: 'icon', href: favicon.value }],
    }
  })
})
