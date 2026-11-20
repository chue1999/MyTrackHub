import pino from 'pino';
import { config } from '../config/index.js';

/**
 * Application logger (JSON in production, readable lines in development).
 * Secrets in request headers are never written to the log.
 */
export const logger = pino({
  level: config.isTest ? 'silent' : config.logLevel,
  redact: {
    paths: ['req.headers.authorization', 'req.headers["x-api-key"]', 'req.headers.cookie'],
    censor: '[redacted]',
  },
  ...(config.isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          // One readable line per request; details (err, sql…) only when present.
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,req,res,responseTime' },
        },
      }),
});
