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

/** Next midnight in California (Pacific time): when Google resets the free daily quota. */
function nextPacificMidnight(now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(now)
      .map((x) => [x.type, Number(x.value)]),
  );
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - now.getTime();
  return new Date(Date.UTC(p.year, p.month - 1, p.day + 1) - offset);
}

/**
 * When a model whose quota is used up can be asked again: per-day limits reset at
 * midnight Pacific time; per-minute limits after Google's RetryInfo delay.
 */
function quotaResetAt(err, now = new Date()) {
  const d = err?.details ?? [];
  const daily = d.some((x) => (x.violations ?? []).some((v) => /PerDay/i.test(v.quotaId ?? '')));
  if (daily) return { at: nextPacificMidnight(now), daily: true };
  const delay = d.find((x) => x.retryDelay)?.retryDelay;
  const secs = delay ? parseFloat(delay) : 60;
  return { at: new Date(now.getTime() + Math.ceil(secs) * 1000), daily: false };
}

const laosTime = (date) =>
  date.toLocaleString('en-GB', { timeZone: 'Asia/Vientiane', hour: '2-digit', minute: '2-digit', hour12: false });
const waitText = (ms) => {
  const min = Math.max(1, Math.round(ms / 60_000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
};

/** The "quota used up" message, with when it can be used again (Laos time). */
function quotaError(resets) {
  const soonest = resets.sort((a, b) => a.at - b.at)[0];
  const err = new Error('Gemini: the free quota is used up.');
  err.status = 429;
  if (!soonest) return err;
  const wait = soonest.at.getTime() - Date.now();
  const when = laosTime(soonest.at);
  err.retryAt = soonest.at.toISOString();
  err.message = soonest.daily
    ? `Gemini: today's free quota is used up. It works again at about ${when} (Laos time), in ${waitText(wait)}. ` +
      `ໃຊ້ໄດ້ອີກປະມານ ${when} ໂມງ. To avoid waiting, turn on billing for the Gemini key (aistudio.google.com).`
    : `Gemini: too many questions this minute. Try again at ${when} (in ${waitText(wait)}). ` +
      `ລອງໃໝ່ເວລາ ${when} ໂມງ.`;
  return err;
}

/**
 * Sends one request to Gemini, trying GEMINI_MODEL then GEMINI_FALLBACK_MODELS.
 * Free keys are often "busy" (503) or out of quota (429): the next model is used
 * at once (each model has its own quota); a busy model gets one quick second try.
 * `build({ model, fast, search })` makes the request body; a 400 first drops
 * Google Search, then the "no thinking" setting, and asks again.
 * Returns { res, model } with an ok response.
 */
async function requestGemini({ action, build, search = false, signal, onStatus = () => {} }) {
  const { key, model, fallbacks, fast } = config.ai.gemini;
  const models = [...new Set([model, ...fallbacks])];
  let lastError = null;
  const resets = []; // when each out-of-quota model can be used again
  for (const [i, m] of models.entries()) {
    if (i > 0) onStatus(`${models[i - 1]} is busy — using ${m}…`);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:${action}`;
    let useSearch = search;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (signal?.aborted) throw new Error('Stopped');
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), FIRST_BYTE_TIMEOUT_MS);
      const useFast = fast && !noFastMode.has(m);
      let res = null;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify(build({ model: m, fast: useFast, search: useSearch })),
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
      if (res?.ok) return { res, model: m };

      if (res) {
        lastError = await providerError(`Gemini (${m})`, res);
        if (res.status === 400 && useSearch) {
          useSearch = false; // this model / key cannot search: answer without
          continue;
        }
        if (res.status === 400 && useFast) {
          noFastMode.add(m);
          continue;
        }
        if (res.status === 401 || res.status === 403) throw lastError; // bad key: no model will work
        if (res.status === 429) resets.push(quotaResetAt(lastError));
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
  // Every model was out of quota: say when the first one works again.
  if (lastError?.status === 429 || (resets.length && resets.length === models.length)) throw quotaError(resets);
  throw lastError ?? new Error('Gemini: no model available right now. Please try again.');
}

const thinking = (fast) => (fast ? { thinkingConfig: { thinkingBudget: 0 } } : {});

/**
 * Gemini (Google) chat, streamed. Fast like the Gemini website: "thinking" is off
 * (GEMINI_FAST=true). With `search`, Gemini may look things up on Google Search.
 */
export async function streamGemini({ system, messages, onText, onStatus, signal, search = false }) {
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [...(m.files ?? []).map(filePart), { text: m.content }],
  }));
  const { res, model } = await requestGemini({
    action: 'streamGenerateContent?alt=sse',
    search,
    signal,
    onStatus,
    build: ({ fast, search: s }) => ({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      ...(s ? { tools: [{ google_search: {} }] } : {}),
      ...(fast ? { generationConfig: thinking(fast) } : {}),
    }),
  });
  let usage = null;
  await readSse(res, (j) => {
    for (const part of j.candidates?.[0]?.content?.parts ?? []) if (part.text && !part.thought) onText(part.text);
    if (j.usageMetadata) usage = j.usageMetadata;
  });
  return { model, tokensIn: usage?.promptTokenCount ?? null, tokensOut: usage?.candidatesTokenCount ?? null };
}

/** One JSON answer from Gemini (used to plan system-data questions). */
export async function geminiJson({ system, prompt, signal, onStatus }) {
  const { res, model } = await requestGemini({
    action: 'generateContent',
    signal,
    onStatus,
    build: ({ fast }) => ({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0, ...thinking(fast) },
    }),
  });
  const j = await res.json();
  const text = (j.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join('');
  try {
    return { model, data: JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')) };
  } catch {
    throw new Error('Gemini: could not understand the plan for this question. Please ask it another way.');
  }
}
