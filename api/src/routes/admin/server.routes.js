import { Router } from 'express';
import * as serverController from '../../controllers/server.controller.js';
import { requireRole } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { createTaskSchema } from '../../validators/server-log.validator.js';

/** Server capacity + cache clearing (MyTPlus administrators only). */
const router = Router();

router.use(requireRole('admin'));
router.get('/status', asyncHandler(serverController.getStatus));
router.get('/caches', asyncHandler(serverController.caches));
router.get('/tasks', asyncHandler(serverController.listTasks));
router.post('/tasks', validate({ body: createTaskSchema }), asyncHandler(serverController.createTask));

export default router;
