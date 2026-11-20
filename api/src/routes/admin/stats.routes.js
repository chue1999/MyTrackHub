import { Router } from 'express';
import * as statsController from '../../controllers/stats.controller.js';
import { asyncHandler } from '../../utils/async-handler.js';

const router = Router();

router.get('/overview', asyncHandler(statsController.overview));
router.get('/packages', asyncHandler(statsController.packages));
router.get('/features', asyncHandler(statsController.features));

export default router;
