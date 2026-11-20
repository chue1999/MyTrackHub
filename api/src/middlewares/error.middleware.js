import { ZodError } from 'zod';
import { HttpError } from '../utils/http-error.js';
import { logger } from '../utils/logger.js';

/** 404 for routes that don't exist. */
export function notFound(req, _res, next) {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl.split('?')[0]}`));
}

/**
 * Turns every error into the same JSON shape:
 *   { "message": "Readable text", "code": "MACHINE_CODE", "issues"?: [...] }
 * Unexpected errors are logged and answered with a generic 500.
 */
// Express recognises error handlers by their 4 arguments, so `_next` must stay.
export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      message: err.issues[0]?.message || 'Invalid request',
      code: 'VALIDATION_ERROR',
      issues: err.issues,
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message, code: err.code });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Body is not valid JSON', code: 'INVALID_JSON' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Request body is too large', code: 'PAYLOAD_TOO_LARGE' });
  }
  (req.log ?? logger).error({ err }, 'Unhandled error');
  res.status(500).json({ message: 'Server error', code: 'INTERNAL_ERROR' });
}
