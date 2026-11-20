import rateLimit from 'express-rate-limit';

const common = {
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, try again later', code: 'TOO_MANY_REQUESTS' },
};

/** Admin login: 20 attempts per 15 minutes per IP. */
export const loginLimiter = rateLimit({ ...common, windowMs: 15 * 60_000, limit: 20 });

/** App event ingestion: 600 batches per minute per IP. */
export const trackLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 600 });
