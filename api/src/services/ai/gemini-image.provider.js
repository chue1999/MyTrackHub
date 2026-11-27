import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { providerError } from './sse.js';

/**
 * Creating and editing pictures with Gemini's image models ("Nano Banana").
 * One request: the picture(s) to work on + the instruction (with a little of the
 * conversation for context). Returns the text and the pictures Gemini made.
 *
 * Google gives image models NO free quota: the Gemini key needs billing turned on
 * (AI Studio → the key → Set up billing).
 */
export async function generateImage({ prompt, context, images, onStatus = () => {}, signal }) {
  const { key, imageModels } = config.ai.gemini;
  const parts = [
    ...images.map((f) => ({ inline_data: { mime_type: f.mime, data: f.data.toString('base64') } })),
    {
      text: context
        ? `Conversation so far (for context):\n${context}\n\nNow do this: ${prompt}`
        : prompt,
    },
  ];
  const body = JSON.stringify({
    contents: [{ role: 'user', parts }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  });

  let lastError = null;
  for (const [i, m] of imageModels.entries()) {
    if (signal?.aborted) throw new Error('Stopped');
    if (i > 0) onStatus(`${imageModels[i - 1]} is not available — using ${m}…`);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body,
        signal: AbortSignal.any([AbortSignal.timeout(180_000), ...(signal ? [signal] : [])]),
      },
    ).catch((err) => {
      if (signal?.aborted) throw new Error('Stopped');
      lastError = new Error(`Gemini image (${m}): ${err.name === 'TimeoutError' ? 'no answer within 3 minutes' : err.message}`);
      return null;
    });
    if (!res) continue;
    if (!res.ok) {
      lastError = await providerError(`Gemini image (${m})`, res);
      if (res.status === 401 || res.status === 403) throw lastError;
      logger.info({ model: m, status: res.status }, 'Gemini image model unavailable, trying the next one');
      continue;
    }
    const j = await res.json();
    const out = { model: m, text: '', images: [], tokensIn: null, tokensOut: null };
    for (const p of j.candidates?.[0]?.content?.parts ?? []) {
      if (p.thought) continue;
      const d = p.inlineData ?? p.inline_data;
      if (d?.data) out.images.push({ mime: d.mimeType ?? d.mime_type ?? 'image/png', data: Buffer.from(d.data, 'base64') });
      else if (p.text) out.text += p.text;
    }
    out.tokensIn = j.usageMetadata?.promptTokenCount ?? null;
    out.tokensOut = j.usageMetadata?.candidatesTokenCount ?? null;
    if (!out.images.length && !out.text) {
      const why = j.promptFeedback?.blockReason || j.candidates?.[0]?.finishReason || 'no picture returned';
      lastError = new Error(`Gemini image (${m}): ${why}`);
      continue;
    }
    return out;
  }
  if (lastError?.status === 429) {
    lastError.message =
      'Creating pictures needs billing on the Gemini key: Google gives image models no free quota. ' +
      'An administrator can turn it on at aistudio.google.com → API keys → Set up billing.';
  }
  throw lastError ?? new Error('Gemini: picture creation is not available right now.');
}

// Words that ask for a picture to be made or changed (English, Lao, Hmong, Thai).
const IMAGE_ASK = [
  /\b(draw|paint|sketch|illustrate)\b/i,
  /\b(generate|create|make|design|redesign|edit|enhance|retouch)\b.{0,40}\b(image|picture|photo|pic|logo|poster|banner|icon|wallpaper|illustration|drawing)s?\b/i,
  /ແຕ້ມ|ສ້າງຮູບ|ແຕ່ງຮູບ|ແກ້ຮູບ|ປັບຮູບ|ເຮັດຮູບ|(ອອກແບບ|ສ້າງ).{0,15}(ຮູບ|ໂລໂກ້|ໂປສເຕີ|ແບນເນີ)/,
  /\b(kos|tsim|design|kho|hloov)\s+(daim\s+)?duab\b|\bua\s+(ib\s+)?(daim\s+)?duab\s+tshiab\b|\b(tsim|design)\s+(ib\s+)?(tus\s+)?(logo|poster)\b/i,
  /วาด|สร้างรูป|แต่งรูป|แก้รูป|(ออกแบบ|สร้าง).{0,15}(รูป|โลโก้|โปสเตอร์|แบนเนอร์)/,
];
export const wantsImage = (text) => IMAGE_ASK.some((r) => r.test(text || ''));
