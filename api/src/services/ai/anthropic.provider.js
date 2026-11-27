import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config/index.js';

let client = null;
const getClient = () => (client ??= new Anthropic({ apiKey: config.ai.anthropic.key }));

/**
 * Claude (Anthropic) via the official SDK, streamed. Uses server-side refusal
 * fallbacks ("default" routing) so a declined request is retried on a fallback
 * model inside the same call.
 * messages: [{ role: 'user' | 'assistant', content: string }]
 */
export async function streamClaude({ system, messages, onText }) {
  const stream = getClient().beta.messages.stream({
    model: config.ai.anthropic.model,
    max_tokens: 64000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    messages,
  });
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
