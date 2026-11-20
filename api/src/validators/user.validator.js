import { z } from 'zod';

export const updateUserSchema = z.object({
  firstName: z.string().trim().max(100).optional().nullable(),
  lastName: z.string().trim().max(100).optional().nullable(),
  note: z.string().max(5000).optional().nullable(),
});
