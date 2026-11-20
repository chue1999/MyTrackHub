import { Router } from 'express';
import cors from 'cors';
import { config } from '../config/index.js';
import { health } from '../controllers/health.controller.js';
import adminRoutes from './admin/index.js';
import publicRoutes from './public.routes.js';
import trackRoutes from './track.routes.js';

/**
 * Every route of the API.
 *
 *   GET  /health                     health check
 *   POST /api/v1/track               mobile app → events (x-api-key)
 *   *    /api/v1/admin/...           admin website (JWT)
 *   GET  /api/v1/public/branding     website name & logo (no login)
 *
 * /api/admin and /api/public are kept as aliases for older clients.
 */
const router = Router();

// Browsers may only call the admin/public API from the admin website's origin.
// (The mobile app has no browser origin, so /track needs no CORS.)
const websiteCors = cors({ origin: config.corsOrigins, allowedHeaders: ['Content-Type', 'Authorization'] });

router.get('/health', health);
router.use('/api/v1/track', trackRoutes);
router.use(['/api/v1/admin', '/api/admin'], websiteCors, adminRoutes);
router.use(['/api/v1/public', '/api/public'], websiteCors, publicRoutes);

export default router;
