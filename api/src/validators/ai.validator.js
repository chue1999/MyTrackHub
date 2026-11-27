import { z } from 'zod';

export const askSchema = z.object({
  conversationId: z.coerce.number().int().positive().optional().nullable(),
  provider: z.enum(['gemini', 'chatgpt', 'claude']),
  text: z.string().trim().max(20000, 'The question is too long (max 20,000 characters)').default(''),
  // auto: a picture is made when the question asks for one; image: always; chat: never.
  mode: z.enum(['auto', 'chat', 'image']).default('auto'),
  fileIds: z.array(z.coerce.number().int().positive()).max(10, 'At most 10 files per question').default([]),
}).refine((b) => b.text || b.fileIds.length, { message: 'Type a question', path: ['text'] });

export const renameSchema = z.object({ title: z.string().trim().min(1).max(120) });
