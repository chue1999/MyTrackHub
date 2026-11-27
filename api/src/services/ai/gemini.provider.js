import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { fileAsText } from './ai-files.service.js';
import { providerError, readSse } from './sse.js';

// Waiting for Google to START answering; the streamed answer itself has no limit.
const FIRST_BYTE_TIMEOUT_MS = 45_000;

// Pictures and PDFs go inline (base64); text files as text.
const filePart = (f) =>
  f.data && f.kind !== 'text'
    ? { inline_data: { mime_type: f.mime, data: f.data.toString('base64') } }
    : { text: fileAsText(f) };

// Models that rejected the "no thinking" setting (400): asked without it from then on.
const noFastMode = new Set();

/**
 * Gemini (Google) via the Generative Language REST API, streamed (AI Studio key).
 *
 * Fast like the Gemini website: "thinking" is switched off (GEMINI_FAST=true), so
 * the answer starts in a few seconds instead of ~10.
 *
 * Free keys are often "busy" (503) or out of quota (429). Then the next model of
 * GEMINI_MODEL + GEMINI_FALLBACK_MODELS is used at once (each model has its own
 * quota); a busy model gets one quick second try.
 */
export async function streamGemini({ system, messages, onText, onStatus = () => {}, signal }) {
  const { key, model, fallbacks, fast } = config.ai.gemini;
  const models = [...new Set([model, ...fallbacks])];
  const request = {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [...(m.files ?? []).map(filePart), { text: m.content }],
    })),
  };
  const bodyFor = (m) =>
    JSON.stringify(
      fast && !noFastMode.has(m) ? { ...request, generationConfig: { thinkingConfig: { thinkingBudget: 0 } } } : request,
    );

  let lastError = null;
  for (const [i, m] of models.entries()) {
    if (i > 0) onStatus(`${models[i - 1]} is busy — using ${m}…`);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:streamGenerateContent?alt=sse`;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (signal?.aborted) throw new Error('Stopped');
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), FIRST_BYTE_TIMEOUT_MS);
      let res = null;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: bodyFor(m),
          signal: signal ? AbortSignal.any([ctl.signal, signal]) : ctl.signal,
        });
      } catch (err) {
        if (signal?.aborted) throw new Error('Stopped');
        lastError = new Error(
          `Gemini (${m}): ${ctl.signal.aborted ? `no answer within ${FIRST_BYTE_TIMEOUT_MS / 1000} s` : err.message}`,
        );
      } finally {
        clearTimeout(timer); // headers arrived (or failed): the stream itself may take as long as it needs
      }

      if (res?.ok) {
        let usage = null;
        await readSse(res, (j) => {
          for (const part of j.candidates?.[0]?.content?.parts ?? []) if (part.text && !part.thought) onText(part.text);
          if (j.usageMetadata) usage = j.usageMetadata;
        });
        return { model: m, tokensIn: usage?.promptTokenCount ?? null, tokensOut: usage?.candidatesTokenCount ?? null };
      }

      if (res) {
        lastError = await providerError(`Gemini (${m})`, res);
        // This model does not take the "no thinking" setting: ask it again without.
        if (res.status === 400 && fast && !noFastMode.has(m)) {
          noFastMode.add(m);
          continue;
        }
        if (res.status === 401 || res.status === 403) throw lastError; // bad key: no model will work
        // Busy: one quick second try; out of quota / not found / other: next model.
        if (res.status === 503 && attempt === 0) {
          logger.info({ model: m }, 'Gemini busy, trying once more');
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }
      }
      logger.info({ model: m, status: res?.status ?? 'timeout' }, 'Gemini model unavailable, trying the next one');
      break;
    }
  }
  if (lastError?.status === 429) {
    lastError.message =
      'Gemini: the free quota is used up for now (too many questions per minute or per day). Wait a minute and try again, or ask an administrator to turn on billing for the Gemini key.';
  }
  throw lastError ?? new Error('Gemini: no model available right now. Please try again.');
}
