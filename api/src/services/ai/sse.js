/**
 * Reads a Server-Sent-Events HTTP response and calls onData(json) for every
 * `data:` line (used for the OpenAI and Gemini streaming endpoints).
 */
export async function readSse(response, onData) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        onData(JSON.parse(data));
      } catch {
        /* partial or non-JSON line: skip */
      }
    }
  }
}

/** A provider HTTP error with the provider's own message (shown to the user). */
export async function providerError(name, response) {
  let detail = '';
  let details = [];
  try {
    const j = await response.json();
    detail = j?.error?.message || j?.message || JSON.stringify(j).slice(0, 300);
    details = Array.isArray(j?.error?.details) ? j.error.details : [];
  } catch {
    detail = await response.text().catch(() => '');
  }
  const err = new Error(`${name}: ${response.status} ${String(detail).slice(0, 300)}`);
  err.status = response.status;
  err.details = details; // e.g. Google's RetryInfo / QuotaFailure (when the quota is used up)
  return err;
}
