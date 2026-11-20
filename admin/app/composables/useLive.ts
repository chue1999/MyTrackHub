import type { AppUser, TrackedEvent } from '~/composables/useApi'

export interface LiveEventsPayload {
  user: AppUser | null
  events: TrackedEvent[]
}

type Handler = (payload: LiveEventsPayload) => void

// One connection shared by every page.
const connected = ref(false)
const handlers = new Set<Handler>()
let source: EventSource | null = null
let retryTimer: ReturnType<typeof setTimeout> | undefined
let wanted = false

/** Closes the live connection (e.g. on logout). */
export function disconnectLive() {
  wanted = false
  clearTimeout(retryTimer)
  source?.close()
  source = null
  connected.value = false
}

/**
 * Live updates from the API (Server-Sent Events).
 * `onEvents` registers a handler for the current component and removes it
 * automatically when the component is unmounted.
 */
export function useLive() {
  const config = useRuntimeConfig()
  const api = useApi()

  async function connect() {
    if (!import.meta.client || source) return
    wanted = true
    try {
      const { ticket } = await api<{ ticket: string }>('/stream/ticket', { method: 'POST' })
      if (!wanted) return
      const es = new EventSource(
        `${config.public.apiBase}/api/admin/stream?ticket=${encodeURIComponent(ticket)}`,
      )
      source = es
      es.addEventListener('hello', () => (connected.value = true))
      // The logo was changed on the Settings page: reload it everywhere.
      es.addEventListener('branding', () => useBranding().load())
      es.addEventListener('events', (msg) => {
        const payload = JSON.parse((msg as MessageEvent).data) as LiveEventsPayload
        handlers.forEach((h) => h(payload))
      })
      es.onerror = () => {
        // Tickets are one-time, so reconnect ourselves with a fresh one.
        es.close()
        if (source === es) source = null
        connected.value = false
        scheduleRetry()
      }
    } catch {
      connected.value = false
      scheduleRetry()
    }
  }

  function scheduleRetry() {
    clearTimeout(retryTimer)
    if (wanted) retryTimer = setTimeout(connect, 3000)
  }

  function onEvents(handler: Handler) {
    handlers.add(handler)
    if (getCurrentInstance()) onBeforeUnmount(() => handlers.delete(handler))
    return () => handlers.delete(handler)
  }

  return { connected: readonly(connected), connect, disconnect: disconnectLive, onEvents }
}

/** Runs `fn` at most once per `ms`, after the last call (for refetching). */
export function debounce<T extends (...args: never[]) => unknown>(fn: T, ms = 1000) {
  let t: ReturnType<typeof setTimeout> | undefined
  return (...args: Parameters<T>) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}
