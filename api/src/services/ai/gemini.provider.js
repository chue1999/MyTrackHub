import { config } from '../../config/index.js';
import { providerError, readSse } from './sse.js';

/** Gemini (Google) via the Generative Language REST API, streamed (free tier with an AI Studio key). */
export async function streamGemini({ system, messages, onText }) {
  const { key, model } = config.ai.gemini;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    }),
  });
  if (!res.ok) throw await providerError('Gemini', res);
  let usage = null;
  await readSse(res, (j) => {
    for (const part of j.candidates?.[0]?.content?.parts ?? []) if (part.text) onText(part.text);
    if (j.usageMetadata) usage = j.usageMetadata;
  });
  return { model, tokensIn: usage?.promptTokenCount ?? null, tokensOut: usage?.candidatesTokenCount ?? null };
}
