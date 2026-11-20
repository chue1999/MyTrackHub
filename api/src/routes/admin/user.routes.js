import { Router } from 'express';
import * as userController from '../../controllers/user.controller.js';
import { requireRole } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { updateUserSchema } from '../../validators/user.validator.js';

/** People using the mobile app. */
const router = Router();

router.get('/', asyncHandler(userController.list));
router.get('/:id', asyncHandler(userController.detail));
router.patch('/:id', requireRole('admin'), validate({ body: updateUserSchema }), asyncHandler(userController.update));

export default router;
