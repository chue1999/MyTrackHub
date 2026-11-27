import * as ai from '../services/ai/ai.service.js';
import * as aiFiles from '../services/ai/ai-files.service.js';

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

/** POST /ai/files — upload one file (raw bytes; name and type in the x-file-name / x-file-type headers). */
export async function upload(req, res) {
  let name = 'file';
  try {
    name = decodeURIComponent(String(req.get('x-file-name') || 'file'));
  } catch {
    /* keep the default name */
  }
  res.status(201).json(await aiFiles.upload(req.me, { name, mime: req.get('x-file-type'), data: req.body }));
}

/** GET /ai/files/:id — the file itself (for previews and downloads); only its owner. */
export async function file(req, res) {
  const f = await aiFiles.getOwn(req.me, req.params.id);
  res.set({
    'Content-Type': f.kind === 'text' ? 'text/plain; charset=utf-8' : f.mime,
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    'Cache-Control': 'private, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(Buffer.from(f.data));
}

/** DELETE /ai/files/:id — remove an upload that was not sent yet. */
export async function removeFile(req, res) {
  await aiFiles.removePending(req.me, req.params.id);
  res.status(204).end();
}
