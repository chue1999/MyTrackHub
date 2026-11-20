/** API errors look like { message, code } (see the API's error middleware). */
export interface ApiErrorBody {
  message?: string
  code?: string
}

/**
 * The message to show for a failed request: the API's own message when it
 * sent one, otherwise the given fallback.
 */
export function errorMessage(err: unknown, fallback: string): string {
  const data = (err as { data?: ApiErrorBody } | null | undefined)?.data
  return typeof data?.message === 'string' && data.message ? data.message : fallback
}
