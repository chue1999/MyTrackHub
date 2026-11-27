import { z } from 'zod';
import { CLEANUP_DAYS } from '../services/log-cleanup.service.js';

export const cleanupQuery = z.object({
  kind: z.enum(['mytplus', 'ccare', 'server']).default('ccare'),
  days: z.coerce
    .number()
    .int()
    .refine((d) => CLEANUP_DAYS.includes(d), `Choose one of: ${CLEANUP_DAYS.join(', ')} days`),
});
