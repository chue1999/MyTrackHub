import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { fileAsText } from './ai-files.service.js';
import { providerError, readSse } from './sse.js';

// Waiting for Google to START answering; the streamed answer itself has no limit.
const FIRST_BYTE_TIMEOUT_MS = 60_000;
// Busy / rate-limited / server error: try again, then move on to the next model.
const RETRY_STATUS = [429, 500, 503];

/**
 * Gemini (Google) via the Generative Language REST API, streamed (free tier with
 * an AI Studio key). Free-tier models are sometimes "experiencing high demand"
 * (503): each model is tried twice, then the next one in GEMINI_MODEL +
 * GEMINI_FALLBACK_MODELS is used.
 */
// Pictures and PDFs go inline (base64); text files as text.
const filePart = (f) =>
  f.data && f.kind !== 'text'
    ? { inline_data: { mime_type: f.mime, data: f.data.toString('base64') } }
    : { text: fileAsText(f) };

export async function streamGemini({ system, messages, onText }) {
  const { key, model, fallbacks } = config.ai.gemini;
  const models = [...new Set([model, ...fallbacks])];
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [...(m.files ?? []).map(filePart), { text: m.content }],
    })),
  });

  let res = null;
  let used = model;
  let lastError = null;
  outer: for (const m of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:streamGenerateContent?alt=sse`;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), FIRST_BYTE_TIMEOUT_MS);
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body,
          signal: ctl.signal,
        });
      } catch (err) {
        lastError = new Error(`Gemini (${m}): ${err.name === 'AbortError' ? 'no answer within 60 s' : err.message}`);
        res = null;
      } finally {
        clearTimeout(timer); // headers arrived (or failed): the stream itself may take as long as it needs
      }
      if (res?.ok) {
        used = m;
        break outer;
      }
      if (res) {
        lastError = await providerError(`Gemini (${m})`, res);
        if (!RETRY_STATUS.includes(res.status)) throw lastError; // e.g. bad key: no point trying other models
      }
      logger.info({ model: m, status: res?.status, attempt }, 'Gemini busy, retrying');
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  if (!res?.ok) throw lastError ?? new Error('Gemini: no model available right now. Please try again.');

  let usage = null;
  await readSse(res, (j) => {
    for (const part of j.candidates?.[0]?.content?.parts ?? []) if (part.text) onText(part.text);
    if (j.usageMetadata) usage = j.usageMetadata;
  });
  return { model: used, tokensIn: usage?.promptTokenCount ?? null, tokensOut: usage?.candidatesTokenCount ?? null };
}
