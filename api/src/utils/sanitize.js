// Keys that must never be stored, even if the app sends them by mistake.
const SENSITIVE_PART = /password|passwd|token|secret|authorization|cookie|cvv|otp|pincode|card_?number/i;
const SENSITIVE_WORDS = new Set(['pin', 'pass', 'pwd']);

/** True for "password", "accessToken", "PinCode", "user_pin"… but not "spinId". */
export function isSensitiveKey(key) {
  if (SENSITIVE_PART.test(key)) return true;
  const words = String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/);
  return words.some((w) => SENSITIVE_WORDS.has(w));
}

/** Drops sensitive keys and trims very large values from event properties. */
export function sanitizeProperties(input, depth = 0) {
  if (input == null || typeof input !== 'object') return {};
  if (depth > 5) return {};
  const out = Array.isArray(input) ? [] : {};
  for (const [key, value] of Object.entries(input).slice(0, 50)) {
    if (isSensitiveKey(key)) continue;
    if (value && typeof value === 'object') {
      out[key] = sanitizeProperties(value, depth + 1);
    } else if (typeof value === 'string') {
      out[key] = value.slice(0, 1000);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Normalises Lao numbers: "+856 20 5555 1234" / "8562055551234" → "2055551234". */
export function normalizeMsisdn(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('856')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.length >= 6 && digits.length <= 15 ? digits : null;
}
