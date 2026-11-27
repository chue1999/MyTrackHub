import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config/index.js';
import { fileAsText } from './ai-files.service.js';

let client = null;
const getClient = () => (client ??= new Anthropic({ apiKey: config.ai.anthropic.key }));

/**
 * Claude (Anthropic) via the official SDK, streamed. Uses server-side refusal
 * fallbacks ("default" routing) so a declined request is retried on a fallback
 * model inside the same call.
 * messages: [{ role: 'user' | 'assistant', content: string, files?: [...] }]
 */
/** Our message → Claude message; pictures as image blocks, PDFs as document blocks, text files as text. */
function toClaude(m) {
  if (!m.files?.length || m.role !== 'user') return { role: m.role, content: m.content };
  const blocks = m.files.map((f) => {
    if (!f.data || f.kind === 'text') return { type: 'text', text: fileAsText(f) };
    const source = { type: 'base64', media_type: f.mime, data: f.data.toString('base64') };
    return f.kind === 'image' ? { type: 'image', source } : { type: 'document', source, title: f.name };
  });
  return { role: 'user', content: [...blocks, { type: 'text', text: m.content }] };
}

export async function streamClaude({ system, messages, onText, signal }) {
  const stream = getClient().beta.messages.stream({
    model: config.ai.anthropic.model,
    max_tokens: 64000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    messages: messages.map(toClaude),
  }, { signal });
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') onText(event.delta.text);
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === 'refusal') {
    const why = final.stop_details?.explanation ? ` (${final.stop_details.explanation})` : '';
    onText(`\n\n_Claude declined to answer this request${why}._`);
  }
  return {
    model: final.model,
    tokensIn: final.usage?.input_tokens ?? null,
    tokensOut: final.usage?.output_tokens ?? null,
  };
}
