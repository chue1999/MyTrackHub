import { Router } from 'express';
import * as serverLogController from '../../controllers/server-log.controller.js';
import { requireRole } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { listQuery } from '../../validators/server-log.validator.js';

/** Server activity (read-only, MyTPlus administrators only — there is no delete). */
const router = Router();

router.use(requireRole('admin'));
router.get('/', validate({ query: listQuery }), asyncHandler(serverLogController.list));
router.get('/summary', asyncHandler(serverLogController.summary));
router.get('/hosts', asyncHandler(serverLogController.hosts));
router.get('/:id', asyncHandler(serverLogController.get));

export default router;
