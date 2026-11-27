import { Router } from 'express';
import * as controller from '../../controllers/log-cleanup.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { cleanupQuery } from '../../validators/log-cleanup.validator.js';

/**
 * "Delete old logs" on the Logs page. Mounted twice: /logs-cleanup for MyTPlus
 * administrators (any log) and /ccare/logs-cleanup for CCare administrators
 * (the CCare log only); each mount adds its own permission check.
 */
const router = Router();
router.get('/', validate({ query: cleanupQuery }), asyncHandler(controller.preview));
router.delete('/', validate({ query: cleanupQuery }), asyncHandler(controller.run));
export default router;
