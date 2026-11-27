import { z } from 'zod';

export const askSchema = z.object({
  conversationId: z.coerce.number().int().positive().optional().nullable(),
  provider: z.enum(['gemini', 'chatgpt', 'claude']),
  text: z.string().trim().min(1, 'Type a question').max(20000, 'The question is too long (max 20,000 characters)'),
});

export const renameSchema = z.object({ title: z.string().trim().min(1).max(120) });
