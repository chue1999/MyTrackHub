/**
 * Shapes of the data the tracking API sends (see api/src/services).
 * Import with: import type { AppUser } from '~/types/api'
 */

export type EventType = 'login' | 'logout' | 'screen_view' | 'tap' | 'action' | 'api' | 'error'
export type AdminRole = 'admin' | 'viewer'

/**
 * Free-form JSON recorded from the app (request/response bodies, purchase
 * info…). Its shape depends on the T-Plus API that was called.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- arbitrary JSON from external APIs
export type JsonRecord = Record<string, any>

/** A page of a list endpoint. */
export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface AppUser {
  id: string
  msisdn: string
  firstName: string | null
  lastName: string | null
  platform: string | null
  appVersion: string | null
  deviceModel: string | null
  loginCount: number
  firstSeenAt: string
  lastSeenAt: string
  lastLoginAt: string | null
  note?: string | null
  activePackages?:
    | {
        name?: string
        product?: string | number
        totalMb?: number
        usedMb?: number
        remainMb?: number
        expiry?: string
      }[]
    | null
  dataRemainMb?: number | null
  dataUsedMb?: number | null
  packagesUpdatedAt?: string | null
  actionCount?: number
  failedCount?: number
  packageCount?: number
}

export interface TrackedEvent {
  id: string
  userId: string | null
  msisdn: string | null
  sessionId: string | null
  type: EventType
  name: string
  screen: string | null
  properties: Record<string, unknown>
  success: boolean | null
  result: string | null
  platform: string | null
  appVersion: string | null
  deviceModel: string | null
  occurredAt: string
  createdAt?: string
  user?: Pick<AppUser, 'id' | 'msisdn' | 'firstName' | 'lastName'> | null
}

/** The logged-in admin (stored with the token). */
export interface AdminInfo {
  id: number
  username: string
  displayName?: string | null
  role?: AdminRole
}

/** Website name and logo (Settings page). */
export interface Branding {
  logo: string | null
  name: string
  subtitle: string
  title: string
  updatedAt: string | null
  updatedBy: string | null
}

/** Pushed by the live stream when the app sends new events. */
export interface LiveEventsPayload {
  user: AppUser | null
  events: TrackedEvent[]
}
