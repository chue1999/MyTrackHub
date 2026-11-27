import { Op } from 'sequelize';
import { AiFile } from '../../models/index.js';
import { HttpError } from '../../utils/http-error.js';

/** Pictures every provider (Gemini, ChatGPT, Claude) can read. */
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const TEXT_TYPES = /^(text\/|application\/(json|xml|javascript|x-yaml|yaml|sql|x-sh|csv))/;
const TEXT_EXT = /\.(txt|md|csv|tsv|json|xml|html?|css|js|mjs|ts|vue|py|java|kt|go|rb|php|cs|c|cpp|h|sql|sh|ya?ml|ini|env|log|conf)$/i;

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // per file
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_FILES_PER_QUESTION = 10;
// Total file bytes sent back to the model with one question (the history included):
// providers limit the request size (Gemini: 20 MB inline).
const SEND_BUDGET = 15 * 1024 * 1024;

const ownerOf = (me) => ({ ownerKind: me.kind === 'ccare' ? 'ccare' : 'admin', ownerId: Number(me.id) });
export const fileInfo = (f) => ({ id: Number(f.id), name: f.name, mime: f.mime, kind: f.kind, size: f.size });

function kindOf(mime, name) {
  if (IMAGE_TYPES.includes(mime)) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (TEXT_TYPES.test(mime) || TEXT_EXT.test(name)) return 'text';
  return null;
}

/** Stores an uploaded file (not yet linked to a question). */
export async function upload(me, { name, mime, data }) {
  if (!Buffer.isBuffer(data) || !data.length) throw HttpError.badRequest('The file is empty.');
  const cleanName = String(name || 'file').replace(/[\\/\0]/g, '_').slice(0, 200);
  const type = String(mime || '').toLowerCase().split(';')[0].trim();
  const kind = kindOf(type, cleanName);
  if (!kind) {
    throw HttpError.badRequest(
      `"${cleanName}": this file type is not supported. Use pictures (PNG, JPG, WEBP, GIF), PDF, Word, Excel, CSV or text/code files.`,
    );
  }
  if (data.length > MAX_FILE_BYTES) throw HttpError.badRequest(`"${cleanName}" is bigger than 10 MB.`);
  if (kind === 'text') {
    if (data.length > MAX_TEXT_BYTES) throw HttpError.badRequest(`"${cleanName}": text files can be at most 2 MB.`);
    if (data.includes(0)) throw HttpError.badRequest(`"${cleanName}" is not a text file.`);
  }

  // Uploads that were never sent with a question are removed after a day.
  await AiFile.destroy({
    where: { ...ownerOf(me), messageId: null, createdAt: { [Op.lt]: new Date(Date.now() - 86_400_000) } },
  });

  const f = await AiFile.create({
    ...ownerOf(me),
    name: cleanName,
    mime: kind === 'text' ? 'text/plain' : type,
    kind,
    size: data.length,
    data,
  });
  return fileInfo(f);
}

export async function getOwn(me, id) {
  const f = await AiFile.findOne({ where: { id: Number(id), ...ownerOf(me) } });
  if (!f) throw HttpError.notFound('File not found');
  return f;
}

/** Removes an upload that has not been sent yet (the × on the chip). */
export async function removePending(me, id) {
  const f = await getOwn(me, id);
  if (f.messageId) throw HttpError.badRequest('This file is part of a sent question.');
  await f.destroy();
}

/** Links pending uploads to the question that was just sent. */
export async function attach(me, ids, { conversationId, messageId }) {
  if (!ids?.length) return [];
  if (ids.length > MAX_FILES_PER_QUESTION) throw HttpError.badRequest('At most 10 files per question.');
  const files = await AiFile.findAll({
    where: { id: ids.map(Number), ...ownerOf(me), messageId: null },
    attributes: ['id', 'name', 'mime', 'kind', 'size'],
  });
  if (files.length !== new Set(ids.map(Number)).size) throw HttpError.badRequest('A file was not found. Attach it again.');
  await AiFile.update({ conversationId, messageId }, { where: { id: files.map((f) => f.id) } });
  return files.map(fileInfo);
}

/** File info (no bytes) per message id, for showing the history. */
export async function infoByMessage(messageIds) {
  const map = new Map();
  if (!messageIds.length) return map;
  const files = await AiFile.findAll({
    where: { messageId: messageIds },
    attributes: ['id', 'messageId', 'name', 'mime', 'kind', 'size'],
    order: [['id', 'ASC']],
  });
  for (const f of files) {
    const k = Number(f.messageId);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(fileInfo(f));
  }
  return map;
}

/**
 * Files with their bytes, per message id, for sending to the model. The newest
 * messages get the byte budget first; older files over the budget are left out
 * (the model is told their names).
 */
export async function dataByMessage(messageIds) {
  const map = new Map();
  if (!messageIds.length) return map;
  const files = await AiFile.findAll({ where: { messageId: messageIds }, order: [['id', 'DESC']] });
  let budget = SEND_BUDGET;
  for (const f of files) {
    const k = Number(f.messageId);
    if (!map.has(k)) map.set(k, []);
    const fits = f.size <= budget;
    if (fits) budget -= f.size;
    map.get(k).unshift({ name: f.name, mime: f.mime, kind: f.kind, data: fits ? Buffer.from(f.data) : null });
  }
  return map;
}

/** A text file (or a file left out) as text for the model. */
export function fileAsText(f) {
  if (!f.data) return `[Attached earlier: "${f.name}" — not sent again because the conversation is large.]`;
  return `File "${f.name}":\n\`\`\`\n${f.data.toString('utf8')}\n\`\`\``;
}

/** Saves a picture the AI made, as part of its answer. */
export async function saveGenerated(me, { conversationId, messageId, name, mime, data }) {
  const f = await AiFile.create({
    ...ownerOf(me),
    conversationId,
    messageId,
    name,
    mime,
    kind: 'image',
    size: data.length,
    data,
  });
  return fileInfo(f);
}

/** The newest picture of a conversation (attached or made by the AI) before a message, with its bytes. */
export async function latestImage(conversationId, beforeMessageId) {
  const f = await AiFile.findOne({
    where: { conversationId, kind: 'image', messageId: { [Op.lt]: beforeMessageId } },
    order: [['id', 'DESC']],
  });
  return f ? { name: f.name, mime: f.mime, kind: 'image', data: Buffer.from(f.data) } : null;
}
