import { config } from '../../config/index.js';
import { providerError, readSse } from './sse.js';

/** ChatGPT (OpenAI) via the Chat Completions REST API, streamed. */
export async function streamOpenAi({ system, messages, onText }) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.ai.openai.key}` },
    body: JSON.stringify({
      model: config.ai.openai.model,
      stream: true,
      stream_options: { include_usage: true },
      messages: [{ role: 'system', content: system }, ...messages],
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
