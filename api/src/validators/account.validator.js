import { z } from 'zod';

export const ADMIN_ROLES = ['admin', 'viewer'];

export const createAccountSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(60)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Letters, numbers, . _ - only'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  displayName: z.string().trim().max(100).optional().nullable(),
  role: z.enum(ADMIN_ROLES).default('viewer'),
  isActive: z.boolean().default(true),
});

// Partial update: defaults must not kick in for fields that weren't sent.
export const updateAccountSchema = z.object({
  username: createAccountSchema.shape.username.optional(),
  password: createAccountSchema.shape.password.optional(),
  displayName: createAccountSchema.shape.displayName,
  role: z.enum(ADMIN_ROLES).optional(),
  isActive: z.boolean().optional(),
});

export const accountIdParams = z.object({ id: z.coerce.number().int().positive() });
