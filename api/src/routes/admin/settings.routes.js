import { Router } from 'express';
import * as settingsController from '../../controllers/settings.controller.js';
import { requireRole } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { brandingSchema, retentionPreviewQuery, retentionSchema } from '../../validators/settings.validator.js';

/** Settings page: everyone can read, administrators can change. */
const router = Router();
const adminOnly = requireRole('admin');

router.get('/retention', validate({ query: retentionPreviewQuery }), asyncHandler(settingsController.getRetention));
router.put(
  '/retention',
  adminOnly,
  validate({ body: retentionSchema }),
  asyncHandler(settingsController.updateRetention),
);
router.post('/retention/run', adminOnly, asyncHandler(settingsController.runRetentionNow));

router.get('/branding', asyncHandler(settingsController.getBranding));
router.put('/branding', adminOnly, validate({ body: brandingSchema }), asyncHandler(settingsController.updateBranding));

export default router;
