import { config } from '../../config/index.js';
import { fileAsText } from './ai-files.service.js';
import { providerError, readSse } from './sse.js';

const dataUrl = (f) => `data:${f.mime};base64,${f.data.toString('base64')}`;
/** Our message → Chat Completions message; pictures as image_url, PDFs as file, text files as text. */
function toOpenAi(m) {
  if (!m.files?.length || m.role !== 'user') return { role: m.role, content: m.content };
  const parts = m.files.map((f) => {
    if (!f.data || f.kind === 'text') return { type: 'text', text: fileAsText(f) };
    if (f.kind === 'image') return { type: 'image_url', image_url: { url: dataUrl(f) } };
    return { type: 'file', file: { filename: f.name, file_data: dataUrl(f) } };
  });
  return { role: 'user', content: [...parts, { type: 'text', text: m.content }] };
}

/** ChatGPT (OpenAI) via the Chat Completions REST API, streamed. */
export async function streamOpenAi({ system, messages, onText, signal }) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.ai.openai.key}` },
    signal,
    body: JSON.stringify({
      model: config.ai.openai.model,
      stream: true,
      stream_options: { include_usage: true },
      messages: [{ role: 'system', content: system }, ...messages.map(toOpenAi)],
    }),
  });
  if (!res.ok) throw await providerError('ChatGPT', res);
  let usage = null;
  let model = config.ai.openai.model;
  await readSse(res, (j) => {
    const text = j.choices?.[0]?.delta?.content;
    if (text) onText(text);
    if (j.usage) usage = j.usage;
    if (j.model) model = j.model;
  });
  return { model, tokensIn: usage?.prompt_tokens ?? null, tokensOut: usage?.completion_tokens ?? null };
}
