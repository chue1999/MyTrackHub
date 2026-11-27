import * as ai from '../services/ai/ai.service.js';

/** GET /ai/providers — which AI providers are set up. */
export function providers(_req, res) {
  res.json(ai.providers());
}

/** GET /ai/conversations — my conversation history (newest first). */
export async function list(req, res) {
  res.json(await ai.listConversations(req.me));
}

/** GET /ai/conversations/:id — one conversation with its messages. */
export async function get(req, res) {
  res.json(await ai.getConversation(req.me, req.params.id));
}

/** PATCH /ai/conversations/:id — rename. */
export async function rename(req, res) {
  res.json(await ai.rename(req.me, req.params.id, req.body.title));
}

/** POST /ai/ask — question → streamed answer (Server-Sent Events). */
export async function ask(req, res) {
  await ai.ask(req.me, req.body, res);
}
