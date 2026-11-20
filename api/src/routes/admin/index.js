import { Router } from 'express';
import * as authController from '../../controllers/auth.controller.js';
import * as streamController from '../../controllers/stream.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { loginLimiter } from '../../middlewares/rate-limit.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { loginSchema } from '../../validators/auth.validator.js';
import accountRoutes from './account.routes.js';
import authRoutes from './auth.routes.js';
import eventRoutes from './event.routes.js';
import settingsRoutes from './settings.routes.js';
import statsRoutes from './stats.routes.js';
import userRoutes from './user.routes.js';

/** Admin website API. Mounted at /api/v1/admin. */
const router = Router();

// ── public ──
router.post('/auth/login', loginLimiter, validate({ body: loginSchema }), asyncHandler(authController.login));
// Real-time stream: authenticated by a one-time ticket instead of a header.
router.get('/stream', streamController.open);

// ── logged in ──
router.use(authenticate);
router.post('/stream/ticket', streamController.ticket);
router.use('/auth', authRoutes);
router.use('/accounts', accountRoutes);
router.use('/stats', statsRoutes);
router.use('/users', userRoutes);
router.use('/events', eventRoutes);
router.use('/settings', settingsRoutes);

export default router;
