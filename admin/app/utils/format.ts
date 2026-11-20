export const EVENT_META: Record<string, { label: string; icon: string; color: string }> = {
  login: { label: 'Login', icon: 'mdi-login', color: 'success' },
  logout: { label: 'Logout', icon: 'mdi-logout', color: 'grey' },
  screen_view: { label: 'Opened screen', icon: 'mdi-cellphone-screenshot', color: 'info' },
  tap: { label: 'Tapped', icon: 'mdi-gesture-tap', color: 'warning' },
  action: { label: 'Action', icon: 'mdi-lightning-bolt', color: 'primary' },
  error: { label: 'Error', icon: 'mdi-alert-circle-outline', color: 'error' },
}

export const EVENT_TYPE_OPTIONS = Object.entries(EVENT_META).map(([value, m]) => ({
  title: m.label,
  value,
}))

export function fullName(u?: { firstName?: string | null; lastName?: string | null } | null) {
  const name = [u?.firstName, u?.lastName].filter(Boolean).join(' ')
  return name || 'Unknown'
}

export function initials(u?: { firstName?: string | null; lastName?: string | null } | null) {
  const a = u?.firstName?.[0] ?? ''
  const b = u?.lastName?.[0] ?? ''
  return (a + b).toUpperCase() || '?'
}

/** "2055551234" → "020 5555 1234" */
export function formatPhone(msisdn?: string | null) {
  if (!msisdn) return '—'
  const d = msisdn.replace(/\D/g, '')
  if (d.length === 10) return `0${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`
  return d
}

export function formatDateTime(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function formatDay(value: string) {
  return new Date(value).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

export function timeAgo(value?: string | null) {
  if (!value) return '—'
  const s = Math.round((Date.now() - new Date(value).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return d < 30 ? `${d} d ago` : formatDateTime(value)
}
