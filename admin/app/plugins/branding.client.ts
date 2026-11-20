// Loads the logo once and keeps the browser-tab icon in step with it.
export default defineNuxtPlugin(() => {
  const { load, favicon } = useBranding()
  load()
  useHead({ link: [{ key: 'favicon', rel: 'icon', href: favicon }] })
})
