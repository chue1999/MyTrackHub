export interface Branding {
  logo: string | null
  updatedAt: string | null
  updatedBy: string | null
}

// Default browser icon: the yellow tile with the chart line used in the sidebar.
export const DEFAULT_FAVICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fcd021"/><stop offset="1" stop-color="#ffb300"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#g)"/><path d="M14 44l12-14 9 8 15-18" fill="none" stroke="#000" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  )

/** The website logo set on the Settings page (shared by every page). */
export function useBranding() {
  const branding = useState<Branding>('branding', () => ({ logo: null, updatedAt: null, updatedBy: null }))
  const config = useRuntimeConfig()

  async function load() {
    try {
      branding.value = await $fetch<Branding>(`${config.public.apiBase}/api/public/branding`)
    } catch {
      // Keep the default logo when the API can't be reached.
    }
  }

  const favicon = computed(() => branding.value.logo || DEFAULT_FAVICON)
  return { branding, load, favicon }
}
