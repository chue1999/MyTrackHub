import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { errorHandler, notFound } from './middlewares/error.middleware.js';
import routes from './routes/index.js';
import { logger } from './utils/logger.js';

/**
 * Builds the Express application (no network or database side effects), so
 * tests can use it directly with supertest.
 */
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // real client IP behind one reverse proxy (nginx, load balancer)

  app.use(helmet());
  app.use(
    pinoHttp({
      logger,
      // Health checks and the live stream would flood the log.
      autoLogging: { ignore: (req) => req.url === '/health' || req.url.includes('/stream') },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      customSuccessMessage: (req, res, ms) => `${req.method} ${req.originalUrl} ${res.statusCode} ${Math.round(ms)}ms`,
      customErrorMessage: (req, res, err) => `${req.method} ${req.originalUrl} ${res.statusCode} ${err.message}`,
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(express.json({ limit: '2mb' }));

  app.use(routes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
