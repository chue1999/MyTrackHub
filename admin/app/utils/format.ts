export const EVENT_META: Record<string, { label: string; icon: string; color: string }> = {
  login: { label: 'Login', icon: 'mdi-login', color: 'success' },
  logout: { label: 'Logout', icon: 'mdi-logout', color: 'grey' },
  screen_view: { label: 'Opened screen', icon: 'mdi-cellphone-screenshot', color: 'info' },
  tap: { label: 'Tapped', icon: 'mdi-gesture-tap', color: 'warning' },
  action: { label: 'Action', icon: 'mdi-lightning-bolt', color: 'primary' },
  api: { label: 'API call', icon: 'mdi-api', color: 'purple' },
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

/** What each T-Plus API means, keyed by the last part of its path. */
export const API_LABELS: Record<string, string> = {
  Login: 'Log in',
  Register: 'Register account',
  RegisterConfirm: 'Confirm registration (OTP)',
  ForgetPassword: 'Forgot password',
  ForgetPasswordConfirm: 'Reset password',
  ForgetPasswordConfirmOTP: 'Confirm password reset (OTP)',
  ChangePassword: 'Change password',
  ChangePasswordConfirm: 'Confirm password change',
  DeleteAccount: 'Delete account',
  CheckKYCAndSimStatus: 'Check SIM / KYC status',
  CheckKYCAndSimStatusByToken: 'Check SIM / KYC status',
  QueryCustomerInfo: 'Load profile & balance',
  QueryLatestRefill: 'Load latest top-ups',
  QueryLogsRefill: 'Top-up history',
  CardRifillForPrepaid: 'Top up with card',
  TransferBalance: 'Transfer balance',
  TransferConfirmOtp: 'Confirm transfer (OTP)',
  QueryTransferHistoryLog: 'Transfer history',
  ListPackage: 'List packages',
  InquiryPackage: 'Check package',
  RegisterPackage: 'Buy package',
  PackageUssdData: 'Load data packages',
  GetPackageDuration: 'Package durations',
  QueryRegisterPackageHistory: 'Package history',
  RegisterPackageBySpinerWheelGame: 'Claim package from lucky wheel',
  PostpayPayment: 'Pay postpaid bill',
  QueryLogsPostpaidPayment: 'Bill payment history',
  BookingSimCard: 'Order SIM card',
  QueryBranch: 'List branches',
  GameRandom: 'Spin / open random box',
  GetLuckySpinerInfo: 'Load lucky wheel',
  QueryGameHistory: 'Game history',
  CheckStatusGame: 'Check game status',
  CheckValidGameUserProfile: 'Check game profile',
  GetAllPremium: 'List premium gifts',
  CreateRedeemPremium: 'Redeem premium gift',
  createRedeemPremium: 'Redeem premium gift',
  HistoryRedeemPremium: 'Premium redeem history',
  CreatePredict: 'Make a prediction',
  GetAllMatches: 'List matches',
  GetAllMatchesGroupByDate: 'List matches',
  GetMatchByUserId: 'My predictions',
  Posters: 'Load home banners',
  GetAllPost: 'Load social feed',
  GetAllPostType: 'Load post types',
  CheckUserChatProfile: 'Check chat profile',
  getAllNotRead: 'Unread notifications',
  TopVideo: 'Top videos',
  GetShortVideo: 'Short videos',
  GetVideoByCategory: 'Videos by category',
  GetVideodetail: 'Watch video',
  GetCatoryVideo: 'Video categories',
  ListVideoPackages: 'Video packages',
  AddVideoPackagePayments: 'Buy video package',
  QueryBook: 'Books',
  SearchBook: 'Search books',
  BookPayment: 'Buy book',
  QueryMyBook: 'My books',
  getRentalPackage: 'Data borrowing packages',
  rentalServices: 'Borrow data / balance',
  historyRental: 'Borrowing history',
}

/** "POST /tplusapp/GameRandom" → "Spin / open random box" (or the raw name). */
export function apiLabel(name: string) {
  const path = name.split(' ')[1] ?? name
  const last = path.split('/').filter((s) => s && !s.startsWith(':')).pop() ?? path
  return API_LABELS[last] ?? last
}

export function formatMoney(v: unknown) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.]/g, ''))
  return Number.isFinite(n) && String(v ?? '') !== '' ? `${n.toLocaleString('en-US')} ₭` : String(v ?? '—')
}

export interface SummaryRow {
  label: string
  value: string
  icon: string
  strong?: boolean
}

type Ev = {
  name: string
  properties: Record<string, any>
  msisdn?: string | null
  user?: { msisdn?: string | null } | null
}

/** Pulls the important business facts out of an API call (who, to whom, how much…). */
export function apiSummary(e: Ev): SummaryRow[] {
  const endpoint = (e.name.split(' ')[1] ?? '').split('/').pop() ?? ''
  const body = (e.properties?.request?.body ?? {}) as Record<string, any>
  const me = formatPhone(e.user?.msisdn ?? e.msisdn ?? null)
  const phone = (v: unknown) => formatPhone(String(v ?? '').replace(/^\+?856/, '').replace(/^0/, ''))
  const rows: SummaryRow[] = []
  const add = (label: string, value: unknown, icon: string, strong = false) => {
    if (value !== undefined && value !== null && value !== '') rows.push({ label, value: String(value), icon, strong })
  }

  switch (endpoint) {
    case 'TransferBalance':
      add('From', me, 'mdi-cellphone-arrow-down')
      add('To', body.Receiver && phone(body.Receiver), 'mdi-cellphone-arrow-down-variant', true)
      add('Amount', body.TransferAmount != null ? formatMoney(body.TransferAmount) : null, 'mdi-cash', true)
      break
    case 'TransferConfirmOtp':
      add('From', me, 'mdi-cellphone')
      add('Wants to send to', body.Receiver && phone(body.Receiver), 'mdi-cellphone-arrow-down-variant', true)
      break
    case 'RegisterPackage':
    case 'InquiryPackage':
      add('For number', body.Msisdn ? phone(body.Msisdn) : me, 'mdi-cellphone')
      add('Package', body.PackageCode, 'mdi-package-variant', true)
      break
    case 'CardRifillForPrepaid':
      add('Topped up number', body.Msisdn ? phone(body.Msisdn) : me, 'mdi-cellphone', true)
      break
    case 'PostpayPayment':
      add('Paid for number', body.Msisdn ? phone(body.Msisdn) : me, 'mdi-cellphone', true)
      add('Bill', body.PaymentSubject, 'mdi-file-document-outline')
      break
    case 'BookingSimCard':
      add('Number ordered', body.Tel && phone(body.Tel), 'mdi-sim', true)
      add('Amount', body.Amount != null ? formatMoney(body.Amount) : null, 'mdi-cash', true)
      break
    case 'CreateRedeemPremium':
    case 'createRedeemPremium':
      add('Gift id', body.pdId, 'mdi-gift-outline', true)
      add('Receiver name', body.customerName, 'mdi-account')
      add('Receiver phone', body.tel && phone(body.tel), 'mdi-cellphone')
      add('Address', body.adress, 'mdi-map-marker-outline')
      break
    case 'rentalServices':
      add('Rental id', body.rentalId, 'mdi-identifier', true)
      break
  }
  if (body.GiftCode) {
    add('Gift code', body.GiftCode, 'mdi-gift-outline', true)
    add('Data', body.Net, 'mdi-wifi')
    add('Duration', body.Duration, 'mdi-timer-outline')
  }
  return rows
}

/** One-line version of apiSummary for the timeline. */
export function apiSummaryLine(e: Ev) {
  const r = apiSummary(e)
  const get = (l: string) => r.find((x) => x.label === l)?.value
  if (get('To')) return [get('From'), '→', get('To'), get('Amount') && `· ${get('Amount')}`].filter(Boolean).join(' ')
  return r.filter((x) => x.strong).map((x) => `${x.label}: ${x.value}`).join(' · ')
}

const ACTION_LABELS: Record<string, string> = {
  app_started: 'Started the app',
  app_opened: 'Came back to the app',
}

/** Human title for any event: "Logged in", "Transfer balance", "Opened HomeScreen"… */
export function eventTitle(e: { type: string; name: string }) {
  switch (e.type) {
    case 'api':
      return apiLabel(e.name)
    case 'login':
      return 'Logged in'
    case 'logout':
      return 'Logged out'
    case 'screen_view':
      return screenLabel(e.name)
    case 'action':
      return ACTION_LABELS[e.name] ?? e.name
    default:
      return e.name
  }
}

/** "/mainLayout/services/transfer/requestTransfer" → "requestTransfer"; class names stay as they are. */
export function screenLabel(name: string) {
  if (!name.includes('/')) return name
  return name.split('/').filter(Boolean).pop() ?? name
}

export function formatDateLong(value: string) {
  return new Date(value).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
