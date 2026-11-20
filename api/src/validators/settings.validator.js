import { z } from 'zod';
import { LOGO_MAX_CHARS, LOGO_PATTERN } from '../services/branding.service.js';
import { RETENTION_MONTHS } from '../services/retention.service.js';

export const retentionSchema = z.object({
  enabled: z.boolean(),
  months: z
    .number()
    .int()
    .refine((m) => RETENTION_MONTHS.includes(m), 'Choose one of the listed periods'),
});

export const retentionPreviewQuery = z.object({
  months: z.coerce
    .number()
    .int()
    .optional()
    .transform((m) => (RETENTION_MONTHS.includes(m) ? m : undefined)),
});

/** Send only what changed (e.g. just the logo, or just the names). */
export const brandingSchema = z
  .object({
    logo: z
      .string()
      .max(LOGO_MAX_CHARS, 'The logo file is too big (max about 500 KB)')
      .regex(LOGO_PATTERN, 'Use a PNG, JPG, WEBP or SVG image')
      .nullable(),
    name: z.string().trim().min(1, 'Enter the website name').max(40, 'Website name: 40 characters max'),
    subtitle: z.string().trim().max(60, 'Subtitle: 60 characters max'),
    title: z.string().trim().min(1, 'Enter the browser tab title').max(80, 'Browser tab title: 80 characters max'),
  })
  .partial();
