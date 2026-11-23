/** Logs out after this long with no mouse, keyboard, touch or scroll. */
export const IDLE_LIMIT_MS = 10 * 60 * 1000

// Shared by every open tab, so working in one tab keeps the others signed in too.
const STORAGE_KEY = 'admin_last_active'
const EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const

function readLastActive(): number {
  try {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0
  } catch {
    return 0
  }
}

function writeLastActive(t: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(t))
  } catch {
    // Storage blocked: this tab still tracks its own activity.
  }
}

/** Marks "active now" for every tab. Called right after signing in. */
export function resetIdleTimer() {
  writeLastActive(Date.now())
}

/** Call once from the signed-in layout. */
export function useIdleLogout() {
  const { logout, isLoggedIn } = useAuth()
  let lastActive = 0
  let lastWrite = 0
  let timer: ReturnType<typeof setInterval> | undefined

  function markActive() {
    const now = Date.now()
    lastActive = now
    // Write at most every 5 s; mousemove fires constantly.
    if (now - lastWrite > 5000) {
      lastWrite = now
      writeLastActive(now)
    }
  }

  function check() {
    if (!isLoggedIn.value) return
    const last = Math.max(lastActive, readLastActive())
    if (Date.now() - last >= IDLE_LIMIT_MS) {
      stop()
      logout('idle')
    }
  }

  function onVisible() {
    // After the laptop sleeps or the tab was hidden, check straight away.
    if (document.visibilityState === 'visible') check()
  }

  function stop() {
    clearInterval(timer)
    EVENTS.forEach((e) => window.removeEventListener(e, markActive))
    document.removeEventListener('visibilitychange', onVisible)
  }

  onMounted(() => {
    // Browser reopened long after the last use: the cookie may still be valid, so check first.
    const stored = readLastActive()
    lastActive = stored && Date.now() - stored >= IDLE_LIMIT_MS ? stored : Date.now()
    check()
    if (!isLoggedIn.value) return
    writeLastActive(lastActive)
    lastWrite = lastActive

    EVENTS.forEach((e) => window.addEventListener(e, markActive, { passive: true }))
    document.addEventListener('visibilitychange', onVisible)
    timer = setInterval(check, 15_000)
  })

  onBeforeUnmount(stop)
}
