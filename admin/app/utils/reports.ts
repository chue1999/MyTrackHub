import type { AppUser, Paged, TrackedEvent, JsonRecord } from '~/types/api'

/** How a column is written to Excel and shown in the preview. */
export type ColType = 'text' | 'number' | 'money' | 'date' | 'phone' | 'result' | 'percent'

export interface ReportColumn {
  key: string
  header: string
  type?: ColType
  width?: number
}

export interface ReportFilters {
  from?: string // ISO
  to?: string // ISO
  search?: string
  feature?: string | null
  result?: 'true' | 'false' | null
}

export type Row = Record<string, unknown>
type Api = <T>(url: string, opts?: { query?: Record<string, unknown> }) => Promise<T>

export interface ReportDef {
  key: string
  label: string
  icon: string
  description: string
  /** Which filters make sense for this report. */
  filters: ('search' | 'feature' | 'result')[]
  columns: ReportColumn[]
  load: (
    api: Api,
    f: ReportFilters,
    onProgress: (loaded: number, total: number) => void,
  ) => Promise<{ rows: Row[]; total: number }>
  summary: (rows: Row[]) => { label: string; value: string | number; type?: ColType }[]
}

/** Biggest report we build at once (Excel itself allows ~1 million rows). */
export const MAX_ROWS = 50_000
const PAGE = 5000

async function loadAll<T>(
  api: Api,
  url: string,
  query: Record<string, unknown>,
  onProgress: (l: number, t: number) => void,
) {
  const items: T[] = []
  let page = 1
  let total: number
  for (;;) {
    const res = await api<Paged<T>>(url, { query: { ...query, page, pageSize: PAGE } })
    total = res.total
    items.push(...res.items)
    onProgress(items.length, Math.min(total, MAX_ROWS))
    if (items.length >= total || items.length >= MAX_ROWS || !res.items.length) break
    page++
  }
  return { items: items.slice(0, MAX_ROWS), total }
}

const resultText = (s: boolean | null | undefined) => (s === true ? 'Success' : s === false ? 'Failed' : '')
const bareNumber = (v: unknown) =>
  String(v ?? '')
    .replace(/^\+?856/, '')
    .replace(/^0/, '')
const num = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) && String(v ?? '') !== '' ? n : null
}
const eventQuery = (f: ReportFilters, extra: Record<string, unknown> = {}) => ({
  from: f.from,
  to: f.to,
  search: f.search || undefined,
  success: f.result || undefined,
  apis: f.feature ? Object.keys(FEATURE_BY_KEY[f.feature]?.apis ?? {}).join(',') : undefined,
  ...extra,
})

// ── activity rows (shared by Activity, Failed) ──
const ACTIVITY_COLUMNS: ReportColumn[] = [
  { key: 'time', header: 'Date & time', type: 'date', width: 20 },
  { key: 'name', header: 'User name', width: 22 },
  { key: 'phone', header: 'Phone number', type: 'phone', width: 16 },
  { key: 'feature', header: 'Feature', width: 22 },
  { key: 'action', header: 'What they did', width: 30 },
  { key: 'result', header: 'Result', type: 'result', width: 10 },
  { key: 'message', header: 'Server message', width: 36 },
  { key: 'details', header: 'Details', width: 46 },
  { key: 'type', header: 'Type', width: 14 },
  { key: 'api', header: 'API', width: 40 },
  { key: 'screen', header: 'Screen', width: 30 },
  { key: 'ms', header: 'Time taken (ms)', type: 'number', width: 14 },
]
function activityRow(e: TrackedEvent): Row {
  const p = (e.properties ?? {}) as JsonRecord
  return {
    time: new Date(e.occurredAt),
    name: e.user ? fullName(e.user) : 'Guest',
    phone: e.user?.msisdn ?? e.msisdn ?? '',
    feature: featureOf(e)?.label ?? (e.type === 'api' ? 'Other' : (EVENT_META[e.type]?.label ?? e.type)),
    action: eventTitle(e),
    result: resultText(e.success),
    message: e.result ?? (e.type === 'logout' ? logoutReason(p.reason) : ''),
    details: e.type === 'api' ? apiSummaryLine(e) : '',
    type: EVENT_META[e.type]?.label ?? e.type,
    api: e.type === 'api' ? e.name : '',
    screen: e.screen ?? '',
    ms: p.ms ?? null,
  }
}
const activitySummary = (rows: Row[]) => [
  { label: 'Actions', value: rows.length, type: 'number' as ColType },
  { label: 'Users', value: new Set(rows.map((r) => r.phone).filter(Boolean)).size, type: 'number' as ColType },
  { label: 'Succeeded', value: rows.filter((r) => r.result === 'Success').length, type: 'number' as ColType },
  { label: 'Failed', value: rows.filter((r) => r.result === 'Failed').length, type: 'number' as ColType },
]

export const REPORTS: ReportDef[] = [
  {
    key: 'activity',
    label: 'All activity',
    icon: 'mdi-timeline-text-outline',
    description: 'Every login, screen, tap and API call, with user, result and details',
    filters: ['search', 'feature', 'result'],
    columns: ACTIVITY_COLUMNS,
    async load(api, f, onProgress) {
      const { items, total } = await loadAll<TrackedEvent>(api, '/events', eventQuery(f), onProgress)
      return { rows: items.map(activityRow), total }
    },
    summary: activitySummary,
  },
  {
    key: 'failed',
    label: 'Failed actions',
    icon: 'mdi-alert-circle-outline',
    description: 'Only actions that failed, with the server message',
    filters: ['search', 'feature'],
    columns: ACTIVITY_COLUMNS,
    async load(api, f, onProgress) {
      const { items, total } = await loadAll<TrackedEvent>(
        api,
        '/events',
        eventQuery({ ...f, result: 'false' }),
        onProgress,
      )
      return { rows: items.map(activityRow), total }
    },
    summary: activitySummary,
  },
  {
    key: 'transfers',
    label: 'Transfers',
    icon: 'mdi-bank-transfer',
    description: 'Who sent money to which number, how much, and whether it worked',
    filters: ['search', 'result'],
    columns: [
      { key: 'time', header: 'Date & time', type: 'date', width: 20 },
      { key: 'name', header: 'Sender name', width: 22 },
      { key: 'phone', header: 'Sender phone', type: 'phone', width: 16 },
      { key: 'receiver', header: 'Receiver phone', type: 'phone', width: 16 },
      { key: 'amount', header: 'Amount', type: 'money', width: 14 },
      { key: 'result', header: 'Result', type: 'result', width: 10 },
      { key: 'message', header: 'Server message', width: 36 },
    ],
    async load(api, f, onProgress) {
      const { items, total } = await loadAll<TrackedEvent>(
        api,
        '/events',
        eventQuery(f, { apis: 'TransferBalance' }),
        onProgress,
      )
      return {
        total,
        rows: items.map((e) => {
          const body = ((e.properties as JsonRecord)?.request?.body ?? {}) as Record<string, unknown>
          return {
            time: new Date(e.occurredAt),
            name: e.user ? fullName(e.user) : 'Unknown',
            phone: e.user?.msisdn ?? e.msisdn ?? '',
            receiver: body.Receiver ? bareNumber(body.Receiver) : '',
            amount: num(body.TransferAmount),
            result: resultText(e.success),
            message: e.result ?? '',
          }
        }),
      }
    },
    summary: (rows) => [
      { label: 'Transfers', value: rows.length, type: 'number' },
      { label: 'Succeeded', value: rows.filter((r) => r.result === 'Success').length, type: 'number' },
      { label: 'Failed', value: rows.filter((r) => r.result === 'Failed').length, type: 'number' },
      {
        label: 'Amount transferred (succeeded)',
        value: rows.filter((r) => r.result === 'Success').reduce((s, r) => s + (Number(r.amount) || 0), 0),
        type: 'money',
      },
    ],
  },
  {
    key: 'packages',
    label: 'Package purchases',
    icon: 'mdi-package-variant',
    description: 'Packages bought in the app: package, price, payment channel and result',
    filters: ['search', 'result'],
    columns: [
      { key: 'time', header: 'Date & time', type: 'date', width: 20 },
      { key: 'name', header: 'Buyer name', width: 22 },
      { key: 'phone', header: 'Buyer phone', type: 'phone', width: 16 },
      { key: 'package', header: 'Package', width: 32 },
      { key: 'code', header: 'Code', width: 8 },
      { key: 'data', header: 'Data', width: 10 },
      { key: 'duration', header: 'Duration', width: 12 },
      { key: 'price', header: 'Price', type: 'money', width: 14 },
      { key: 'channel', header: 'Paid with', width: 22 },
      { key: 'forNumber', header: 'For number', type: 'phone', width: 16 },
      { key: 'result', header: 'Result', type: 'result', width: 10 },
      { key: 'message', header: 'Server message', width: 32 },
    ],
    async load(api, f, onProgress) {
      const apis = 'RegisterPackage,RegisterPackageByMMonney,RegisterPackageIR,RegisterPackageBySpinerWheelGame'
      const { items, total } = await loadAll<TrackedEvent>(api, '/events', eventQuery(f, { apis }), onProgress)
      return {
        total,
        rows: items.map((e) => {
          const p = (e.properties as JsonRecord) ?? {}
          const pur = (p.purchase ?? {}) as Record<string, unknown>
          const body = (p.request?.body ?? {}) as Record<string, unknown>
          return {
            time: new Date(e.occurredAt),
            name: e.user ? fullName(e.user) : 'Unknown',
            phone: e.user?.msisdn ?? e.msisdn ?? '',
            package: pur.name ?? '',
            code: pur.code ?? body.PackageCode ?? body.pkCode ?? '',
            data: pur.net ?? '',
            duration: pur.duration ?? '',
            price: num(pur.price),
            channel: CHANNEL_META[String(pur.channel)]?.label ?? (pur.channel ? String(pur.channel) : ''),
            forNumber: pur.forNumber ? bareNumber(pur.forNumber) : '',
            result: resultText(e.success),
            message: e.result ?? '',
          }
        }),
      }
    },
    summary: (rows) => [
      { label: 'Purchases', value: rows.length, type: 'number' },
      { label: 'Sold (succeeded)', value: rows.filter((r) => r.result === 'Success').length, type: 'number' },
      { label: 'Failed', value: rows.filter((r) => r.result === 'Failed').length, type: 'number' },
      {
        label: 'Revenue',
        value: rows.filter((r) => r.result === 'Success').reduce((s, r) => s + (Number(r.price) || 0), 0),
        type: 'money',
      },
    ],
  },
  {
    key: 'users',
    label: 'Users',
    icon: 'mdi-account-group-outline',
    description: 'Every user with phone number, activity, failures and data left',
    filters: ['search'],
    columns: [
      { key: 'name', header: 'Name', width: 24 },
      { key: 'phone', header: 'Phone number', type: 'phone', width: 16 },
      { key: 'actions', header: 'Actions', type: 'number', width: 10 },
      { key: 'failed', header: 'Failed', type: 'number', width: 10 },
      { key: 'logins', header: 'Logins', type: 'number', width: 10 },
      { key: 'dataLeft', header: 'Data left (MB)', type: 'number', width: 14 },
      { key: 'packages', header: 'Active packages', type: 'number', width: 14 },
      { key: 'lastActive', header: 'Last active', type: 'date', width: 20 },
      { key: 'firstSeen', header: 'First seen', type: 'date', width: 20 },
      { key: 'device', header: 'Device', width: 26 },
      { key: 'appVersion', header: 'App version', width: 12 },
      { key: 'note', header: 'Note', width: 30 },
    ],
    async load(api, f, onProgress) {
      const { items, total } = await loadAll<AppUser>(
        api,
        '/users',
        { from: f.from, to: f.to, search: f.search || undefined, sort: 'lastSeenAt' },
        onProgress,
      )
      return {
        total,
        rows: items.map((u) => ({
          name: fullName(u),
          phone: u.msisdn,
          actions: u.actionCount ?? 0,
          failed: u.failedCount ?? 0,
          logins: u.loginCount,
          dataLeft: u.dataRemainMb ?? null,
          packages: u.packageCount ?? null,
          lastActive: new Date(u.lastSeenAt),
          firstSeen: new Date(u.firstSeenAt),
          device: [u.deviceModel, u.platform].filter(Boolean).join(' · '),
          appVersion: u.appVersion ?? '',
          note: u.note ?? '',
        })),
      }
    },
    summary: (rows) => [
      { label: 'Users', value: rows.length, type: 'number' },
      { label: 'Actions', value: rows.reduce((s, r) => s + (Number(r.actions) || 0), 0), type: 'number' },
      { label: 'Failed actions', value: rows.reduce((s, r) => s + (Number(r.failed) || 0), 0), type: 'number' },
    ],
  },
  {
    key: 'features',
    label: 'App features',
    icon: 'mdi-apps',
    description: 'How often each app function was used, and how often it failed',
    filters: [],
    columns: [
      { key: 'feature', header: 'Feature', width: 26 },
      { key: 'action', header: 'Action', width: 32 },
      { key: 'uses', header: 'Uses', type: 'number', width: 10 },
      { key: 'succeeded', header: 'Succeeded', type: 'number', width: 11 },
      { key: 'failed', header: 'Failed', type: 'number', width: 10 },
      { key: 'rate', header: 'Success rate', type: 'percent', width: 12 },
      { key: 'users', header: 'Users', type: 'number', width: 10 },
      { key: 'lastUsed', header: 'Last used', type: 'date', width: 20 },
      { key: 'api', header: 'API', width: 40 },
    ],
    async load(api, f, onProgress) {
      const res = await api<{
        apis: { name: string; uses: number; succeeded: number; failed: number; users: number; lastAt: string }[]
      }>('/stats/features', { query: { from: f.from, to: f.to } })
      onProgress(res.apis.length, res.apis.length)
      const rows = res.apis
        .map((a) => {
          const found = lookupApi(a.name)
          const checked = a.succeeded + a.failed
          return {
            feature: found?.feature.label ?? 'Other',
            action: found?.label ?? apiLabel(a.name),
            uses: a.uses,
            succeeded: a.succeeded,
            failed: a.failed,
            rate: checked ? a.succeeded / checked : null,
            users: a.users,
            lastUsed: new Date(a.lastAt),
            api: a.name,
          }
        })
        .sort((x, y) => x.feature.localeCompare(y.feature) || y.uses - x.uses)
      return { rows, total: rows.length }
    },
    summary: (rows) => [
      { label: 'Features used', value: new Set(rows.map((r) => r.feature)).size, type: 'number' },
      { label: 'Actions', value: rows.reduce((s, r) => s + (Number(r.uses) || 0), 0), type: 'number' },
      { label: 'Failed', value: rows.reduce((s, r) => s + (Number(r.failed) || 0), 0), type: 'number' },
    ],
  },
]

export const REPORT_BY_KEY = Object.fromEntries(REPORTS.map((r) => [r.key, r])) as Record<string, ReportDef>

/** Text for a cell in the on-screen preview. */
export function previewCell(v: unknown, type?: ColType) {
  if (v === null || v === undefined || v === '') return '—'
  switch (type) {
    case 'date':
      return v instanceof Date
        ? v.toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        : String(v)
    case 'money':
      return formatMoney(v)
    case 'number':
      return Number(v).toLocaleString('en-US')
    case 'percent':
      return `${Math.round(Number(v) * 100)}%`
    case 'phone':
      return formatPhone(String(v))
    default:
      return String(v)
  }
}
