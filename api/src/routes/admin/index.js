import { Router } from 'express';
import * as authController from '../../controllers/auth.controller.js';
import * as streamController from '../../controllers/stream.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { loginLimiter } from '../../middlewares/rate-limit.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as ccareAuthController from '../../controllers/ccare-auth.controller.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { HttpError } from '../../utils/http-error.js';
import { loginSchema } from '../../validators/auth.validator.js';
import {
  ccareForgotSchema,
  ccareResetCheckSchema,
  ccareResetSchema,
  ccareStartSchema,
  ccareVerifySchema,
  registerSchema,
} from '../../validators/ccare.validator.js';
import accountRoutes from './account.routes.js';
import authRoutes from './auth.routes.js';
import ccareRoutes from './ccare.routes.js';
import eventRoutes from './event.routes.js';
import settingsRoutes from './settings.routes.js';
import sqlConsoleRoutes from './sql-console.routes.js';
import serverLogRoutes from './server-log.routes.js';
import serverRoutes from './server.routes.js';
import aiRoutes from './ai.routes.js';
import statsRoutes from './stats.routes.js';
import userRoutes from './user.routes.js';

/** Admin website API. Mounted at /api/v1/admin. */
const router = Router();

// ── public ──
router.post('/auth/login', loginLimiter, validate({ body: loginSchema }), asyncHandler(authController.login));
// CCare staff portal: password → SMS code → token, plus register and forgot password.
router.get('/auth/ccare/config', ccareAuthController.config);
router.post(
  '/auth/ccare/start',
  loginLimiter,
  validate({ body: ccareStartSchema }),
  asyncHandler(ccareAuthController.start),
);
router.post(
  '/auth/ccare/verify',
  loginLimiter,
  validate({ body: ccareVerifySchema }),
  asyncHandler(ccareAuthController.verify),
);
router.post(
  '/auth/ccare/forgot',
  loginLimiter,
  validate({ body: ccareForgotSchema }),
  asyncHandler(ccareAuthController.forgot),
);
router.post(
  '/auth/ccare/reset/check',
  loginLimiter,
  validate({ body: ccareResetCheckSchema }),
  asyncHandler(ccareAuthController.resetCheck),
);
router.post(
  '/auth/ccare/reset',
  loginLimiter,
  validate({ body: ccareResetSchema }),
  asyncHandler(ccareAuthController.reset),
);
router.post(
  '/auth/ccare/register',
  loginLimiter,
  validate({ body: registerSchema }),
  asyncHandler(ccareAuthController.register),
);
// Real-time stream: authenticated by a one-time ticket instead of a header.
router.get('/stream', streamController.open);

// ── logged in ──
router.use(authenticate);

// CCare staff accounts may only reach the CCare page and their own session,
// never the MyTPlus data endpoints — even by calling the API directly.
router.use((req, _res, next) => {
  if (req.me.kind !== 'ccare') return next();
  if (/^\/(ccare|auth|stream)\b/.test(req.path)) return next(); // no AI chat for CCare
  next(HttpError.forbidden('CCare accounts can only use the CCare page'));
});

router.post('/stream/ticket', streamController.ticket);
router.use('/auth', authRoutes);
router.use('/accounts', accountRoutes);
router.use('/stats', statsRoutes);
router.use('/users', userRoutes);
router.use('/events', eventRoutes);
router.use('/settings', settingsRoutes);
router.use('/sql', sqlConsoleRoutes);
router.use('/server-logs', serverLogRoutes);
router.use('/server', serverRoutes);
router.use('/ai', aiRoutes);
router.use('/ccare', ccareRoutes);

export default router;
