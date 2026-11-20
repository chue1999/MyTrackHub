/** Helpers for reading list/filter parameters from a query string. */

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value) => typeof value === 'string' && UUID_PATTERN.test(value);

const DAY_MS = 86_400_000;

/** ?page=&pageSize= → limit/offset, with sane bounds. */
export function paging(query, maxPageSize = 100) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(maxPageSize, Math.max(1, Number.parseInt(query.pageSize, 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** ?from=&to= as dates (either may be missing). */
export function dateBounds(query) {
  return { from: parseDate(query.from), to: parseDate(query.to) };
}

/**
 * The period a request asks for: ?from=…&to=… (any date-time) or, without
 * them, the last ?days= days (whole days, starting at midnight).
 * Bounds are inclusive and limited to about one year.
 */
export function period(query, defaultDays) {
  let until = parseDate(query.to) ?? new Date();
  let since = parseDate(query.from);
  if (!since) {
    const days = Math.min(366, Math.max(1, Number.parseInt(query.days, 10) || defaultDays));
    since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));
  }
  if (since > until) [since, until] = [until, since];
  const maxMs = 366 * DAY_MS;
  if (until - since > maxMs) since = new Date(until.getTime() - maxMs);
  const days = Math.max(1, Math.ceil((until - since) / DAY_MS));
  return { since, until, days };
}

/** Midnight today (server time). */
export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** "abc" → "%abc%" with LIKE wildcards in the input escaped. */
export const likePattern = (value) => `%${String(value).replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

/** Digits of a phone search without the 856 / leading 0 prefix: "020 5555 1234" → "2055551234". */
export const phoneDigits = (value) => String(value).replace(/\D/g, '').replace(/^856/, '').replace(/^0+/, '');
