import { Router } from 'express';
import * as trackController from '../controllers/track.controller.js';
import { requireAppKey } from '../middlewares/auth.middleware.js';
import { trackLimiter } from '../middlewares/rate-limit.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';
import { trackBatchSchema } from '../validators/track.validator.js';

/** Mobile app → API (header `x-api-key`). Mounted at /api/v1/track. */
const router = Router();

router.post(
  '/',
  trackLimiter,
  requireAppKey,
  validate({ body: trackBatchSchema }),
  asyncHandler(trackController.ingest),
);

export default router;
