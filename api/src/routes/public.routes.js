import { Router } from 'express';
import * as settingsController from '../controllers/settings.controller.js';
import { asyncHandler } from '../utils/async-handler.js';

/** No login needed (used by the login page and the browser tab). Mounted at /api/v1/public. */
const router = Router();

router.get('/branding', asyncHandler(settingsController.getBranding));

export default router;
