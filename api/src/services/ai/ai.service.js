import { config } from '../../config/index.js';
import { AiConversation, AiMessage } from '../../models/index.js';
import { HttpError } from '../../utils/http-error.js';
import { logger } from '../../utils/logger.js';
import * as files from './ai-files.service.js';
import { streamClaude } from './anthropic.provider.js';
import { generateImage, wantsImage } from './gemini-image.provider.js';
import { streamGemini } from './gemini.provider.js';
import { streamOpenAi } from './openai.provider.js';

/** The AI providers; a provider is offered only when its API key is set. */
const PROVIDERS = {
  gemini: { name: 'Gemini', maker: 'Google', stream: streamGemini, cfg: () => config.ai.gemini },
  chatgpt: { name: 'ChatGPT', maker: 'OpenAI', stream: streamOpenAi, cfg: () => config.ai.openai },
  claude: { name: 'Claude', maker: 'Anthropic', stream: streamClaude, cfg: () => config.ai.anthropic },
};

const SYSTEM = [
  'You are a helpful assistant inside the MyTPlus admin website of T-Plus, a mobile operator in Laos.',
  'Staff use you for customer care, writing, translating and general questions.',
  "Reply in the same language as the user's message (Lao, Hmong, Thai, English…).",
  'Use short paragraphs and Markdown (lists, **bold**, code blocks) when it helps.',
  // The website turns these into downloadable files.
  'When the user wants a file: put spreadsheet data (Excel/CSV) in a Markdown table, and code, CSV, JSON, SQL or',
  'other file contents in a fenced code block with the right language; the website shows Download buttons',
  '(Excel for tables, a file for code blocks, Word and PDF for the whole answer). Never say a file cannot be made.',
  'You cannot create or edit pictures yourself in this text chat; the website has a separate picture tool',
  '(the 🎨 button). Never pretend that you created, edited or attached a picture.',
].join(' ');

// How many earlier messages are sent back to the model with each question.
const HISTORY = 40;

const ownerOf = (me) => ({ ownerKind: me.kind === 'ccare' ? 'ccare' : 'admin', ownerId: Number(me.id) });

export function providers() {
  return Object.entries(PROVIDERS)
    .filter(([, p]) => !!p.cfg().key)
    .map(([key, p]) => ({
      key,
      name: p.name,
      maker: p.maker,
      model: p.cfg().model,
      images: key === 'gemini' && config.ai.gemini.imageModels.length > 0, // can create pictures
    }));
}

export async function listConversations(me) {
  return AiConversation.findAll({
    where: ownerOf(me),
    order: [['updatedAt', 'DESC']],
    limit: 200,
    attributes: ['id', 'title', 'provider', 'updatedAt', 'createdAt'],
  });
}

async function own(me, id) {
  const conv = await AiConversation.findOne({ where: { id: Number(id), ...ownerOf(me) } });
  if (!conv) throw HttpError.notFound('Conversation not found');
  return conv;
}

export async function getConversation(me, id) {
  const conv = await own(me, id);
  const rows = await AiMessage.findAll({ where: { conversationId: conv.id }, order: [['id', 'ASC']] });
  const attached = await files.infoByMessage(rows.map((m) => Number(m.id)));
  const messages = rows.map((m) => ({ ...m.toJSON(), files: attached.get(Number(m.id)) ?? [] }));
  return { conversation: conv, messages };
}

export async function rename(me, id, title) {
  const conv = await own(me, id);
  await conv.update({ title: title.slice(0, 120) });
  return conv;
}

/**
 * Asks a question and streams the answer to `res` as Server-Sent Events:
 *   data: {"type":"start","conversationId":1}
 *   data: {"type":"text","text":"…"}          (many)
 *   data: {"type":"done","messageId":2}        or {"type":"error","message":"…"}
 * The question and the answer are both stored (the history).
 */
export async function ask(me, { conversationId, provider, text, fileIds = [], mode = 'auto' }, res) {
  const p = PROVIDERS[provider];
  if (!p || !p.cfg().key) throw HttpError.badRequest(`${p?.name ?? provider} is not set up (no API key).`);

  const conv = conversationId
    ? await own(me, conversationId)
    : await AiConversation.create({
        ...ownerOf(me),
        ownerName: me.username,
        title: (text || 'File').replace(/\s+/g, ' ').slice(0, 80),
      });
  const question = await AiMessage.create({ conversationId: conv.id, role: 'user', content: text, provider });
  await files.attach(me, fileIds, { conversationId: conv.id, messageId: question.id });

  const earlier = await AiMessage.findAll({
    where: { conversationId: conv.id },
    order: [['id', 'DESC']],
    limit: HISTORY,
  });
  // Oldest first; skip failed answers; the model needs user/assistant turns in order.
  // Questions carry their attached files (pictures, PDFs, text).
  const fileData = await files.dataByMessage(earlier.filter((m) => m.role === 'user').map((m) => Number(m.id)));
  const messages = earlier
    .reverse()
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content || (m.role === 'user' ? 'Please look at the attached file(s).' : ''),
      files: fileData.get(Number(m.id)) ?? [],
      ok: !m.error && (m.content || fileData.has(Number(m.id))),
    }))
    .filter((m) => m.ok)
    .map(({ ok: _ok, ...m }) => m);
  while (messages.length && messages[0].role !== 'user') messages.shift();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // nginx: send each chunk at once
  });
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  send({ type: 'start', conversationId: Number(conv.id) });

  // The person closed the chat / reloaded the page: stop asking the AI.
  const stop = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) stop.abort();
  });

  // Picture wanted (🎨 button, or words like "draw…", "design this picture"): Gemini's image model.
  const imageMode =
    provider === 'gemini' && config.ai.gemini.imageModels.length && (mode === 'image' || (mode === 'auto' && wantsImage(text)));
  if (imageMode) {
    await answerWithImage({ me, conv, question, provider, earlier: messages, send, signal: stop.signal });
    res.end();
    return;
  }

  let answer = '';
  try {
    const meta = await p.stream({
      system: SYSTEM,
      messages,
      signal: stop.signal,
      onStatus: (text) => send({ type: 'status', text }),
      onText: (t) => {
        answer += t;
        send({ type: 'text', text: t });
      },
    });
    const saved = await AiMessage.create({
      conversationId: conv.id,
      role: 'assistant',
      content: answer || '(no answer)',
      provider,
      model: meta.model,
      tokensIn: meta.tokensIn,
      tokensOut: meta.tokensOut,
    });
    await conv.update({ provider, updatedAt: new Date() });
    send({ type: 'done', messageId: Number(saved.id), model: meta.model });
  } catch (err) {
    logger.warn({ err: err.message, provider }, 'AI request failed');
    await AiMessage.create({
      conversationId: conv.id,
      role: 'assistant',
      content: answer,
      provider,
      error: String(err.message).slice(0, 500),
    });
    await conv.update({ updatedAt: new Date() });
    send({ type: 'error', message: String(err.message).slice(0, 300) });
  }
  res.end();
}

/**
 * Creates or edits a picture. Works on the pictures attached to this question,
 * or else on the newest picture of the conversation ("make it blue"), so a
 * picture can be improved step by step.
 */
async function answerWithImage({ me, conv, question, provider, earlier, send, signal }) {
  send({ type: 'status', text: 'Creating the picture… (this can take 10–30 s)' });
  try {
    let images = (earlier.at(-1)?.files ?? []).filter((f) => f.kind === 'image' && f.data);
    if (!images.length) {
      const last = await files.latestImage(conv.id, question.id);
      if (last) images = [last];
    }
    const context = earlier
      .slice(0, -1)
      .slice(-6)
      .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${String(m.content).slice(0, 400)}`)
      .join('\n');
    const out = await generateImage({
      prompt: question.content || 'Improve this picture.',
      context,
      images,
      signal,
      onStatus: (text) => send({ type: 'status', text }),
    });
    if (out.text) send({ type: 'text', text: out.text });
    const saved = await AiMessage.create({
      conversationId: conv.id,
      role: 'assistant',
      content: out.text || (out.images.length ? '' : '(no answer)'),
      provider,
      model: out.model,
      tokensIn: out.tokensIn,
      tokensOut: out.tokensOut,
    });
    for (const [i, img] of out.images.entries()) {
      const ext = img.mime.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
      const info = await files.saveGenerated(me, {
        conversationId: conv.id,
        messageId: saved.id,
        name: `tiger-ai-${saved.id}${out.images.length > 1 ? `-${i + 1}` : ''}.${ext}`,
        mime: img.mime,
        data: img.data,
      });
      send({ type: 'file', file: info });
    }
    await conv.update({ provider, updatedAt: new Date() });
    send({ type: 'done', messageId: Number(saved.id), model: out.model });
  } catch (err) {
    logger.warn({ err: err.message }, 'AI picture request failed');
    await AiMessage.create({
      conversationId: conv.id,
      role: 'assistant',
      content: '',
      provider,
      error: String(err.message).slice(0, 500),
    });
    await conv.update({ updatedAt: new Date() });
    send({ type: 'error', message: String(err.message).slice(0, 300) });
  }
}
