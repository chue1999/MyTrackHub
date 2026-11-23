import { z } from 'zod';

const text = (max) => z.string().trim().max(max).optional();

export const listQuery = z.object({
  search: z.string().trim().max(100).optional().default(''),
});

/** Profile fields shared by create and the "Create account" form on the login page. */
const profile = {
  nameLa: z.string().trim().max(100).optional(),
  staffId: text(15),
  staffTel: text(26),
  division: text(50),
  position: text(50),
  brandId: text(2),
  roleCrm: text(20),
};

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Enter a login name').max(35),
  password: z.string().min(4, 'Password must be at least 4 characters').max(40),
  ...profile,
});

export const createSchema = registerSchema.extend({
  descrip: z.enum(['Admin', 'user']).optional().default('user'),
});

export const updateSchema = z.object({
  ...profile,
  descrip: z.enum(['Admin', 'user']).optional(),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(4, 'Password must be at least 4 characters').max(40),
});

export const setActiveSchema = z.object({ active: z.boolean() });

// ── CCare sign-in with an SMS code ──
const loginName = z.string().trim().min(1, 'Enter your login name').max(60);
const code = z.string().trim().min(3, 'Enter the code').max(8);
const challenge = z.string().trim().min(10).max(80);

export const ccareStartSchema = z.object({ name: loginName, password: z.string().min(1, 'Enter your password') });
export const ccareVerifySchema = z.object({ challenge, code });
export const ccareForgotSchema = z.object({ name: loginName });
export const ccareResetSchema = z.object({
  challenge,
  code,
  newPassword: z.string().min(4, 'Password must be at least 4 characters').max(40),
});

// ── CCare activity log ──
export const logsQuery = z.object({
  search: z.string().trim().max(100).optional().default(''),
  action: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
});
