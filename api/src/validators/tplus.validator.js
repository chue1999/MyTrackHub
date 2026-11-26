import { z } from 'zod';

/** Validators for the TPLUS service endpoints (Register E-SIM, Nice Number, Pool, Import IMSI). */

const msisdn = z.string().trim().min(3).max(20);

export const searchQuery = z.object({
  search: z.string().trim().max(40).optional(),
});

export const poolQuery = z.object({
  type: z.string().trim().max(20).optional(),
  search: z.string().trim().max(40).optional(),
});

export const esimRegisterSchema = z.object({
  isdn: z.string().trim().min(3).max(20),
  imsi: z.string().trim().min(5).max(40),
  action: z.string().trim().min(1).max(40),
});

export const niceConfirmSchema = z.object({
  msisdn,
});

export const poolApproveSchema = z.object({
  msisdn,
  priceType: z.string().trim().max(20).optional(),
});
