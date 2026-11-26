import { z } from 'zod';
import { passwordRule } from '../utils/password.js';

const text = (max) => z.string().trim().max(max).optional();

export const listQuery = z.object({
  search: z.string().trim().max(100).optional().default(''),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
});

/** Profile fields shared by create and the "Create account" form on the login page. */
const profile = {
  nameLa: z.string().trim().max(100).optional(),
  staffId: text(15),
  staffTel: text(26),
  division: text(50),
  position: text(50),
  brandId: z.string().trim().max(3, 'Brand: at most 3 characters').optional(),
  roleCrm: text(20),
};

const username = z.string().trim().min(1, 'Enter a username').max(35);

export const registerSchema = z.object({ name: username, password: passwordRule, ...profile });

/**
 * An administrator creates an account: no password here — the system generates
 * one and texts it to the phone, so the phone number is required.
 */
export const createSchema = z.object({
  name: username,
  ...profile,
  staffTel: z
    .string({ error: 'Enter the phone number: the password is sent to it by SMS.' })
    .trim()
    .min(6, 'Enter the phone number: the password is sent to it by SMS.')
    .max(26),
  descrip: z.enum(['Admin', 'user']).optional().default('user'),
});

export const updateSchema = z.object({
  ...profile,
  descrip: z.enum(['Admin', 'user']).optional(),
});

/** An administrator sends a new (generated) password by SMS: no body needed. */
export const resetPasswordSchema = z.object({}).passthrough();

export const setActiveSchema = z.object({ active: z.boolean() });

// ── CCare sign-in with an SMS code ──
const loginName = z.string().trim().min(1, 'Enter your username').max(60);
const code = z.string().trim().min(3, 'Enter the code').max(8);
const challenge = z.string().trim().min(10).max(80);

export const ccareStartSchema = z.object({ name: loginName, password: z.string().min(1, 'Enter your password') });
export const ccareVerifySchema = z.object({ challenge, code });
export const ccareForgotSchema = z.object({ name: loginName });
export const ccareResetSchema = z.object({
  challenge,
  code,
  newPassword: passwordRule,
});

// ── Vas Service console (operations are logged; telecom wiring comes later) ──
export const vasSubmitSchema = z.object({
  group: z.enum(['action', 'code', 'package', 'kyc']),
  operation: z.string().trim().min(1).max(80),
  fields: z.record(z.string(), z.string().max(120)).optional().default({}),
});

// ── CCare activity log ──
export const logsQuery = z.object({
  search: z.string().trim().max(100).optional().default(''),
  action: z.string().trim().max(40).optional(),
  userId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  // Up to 5000 so the Excel export can page through the whole log quickly.
  pageSize: z.coerce.number().int().min(1).max(5000).optional().default(50),
});

/** DELETE /ccare/logs — optional filters to clear a subset (or all). */
export const logsClearQuery = z.object({
  action: z.string().trim().max(40).optional(),
  userId: z.coerce.number().int().positive().optional(),
  before: z.string().trim().max(40).optional(),
});
