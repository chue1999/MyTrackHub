import { Router } from 'express';
import * as authController from '../../controllers/auth.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { changePasswordSchema } from '../../validators/auth.validator.js';

/** Routes for the logged-in admin (login itself is in admin/index.js). */
const router = Router();

router.get('/me', authController.me);
router.post('/password', validate({ body: changePasswordSchema }), asyncHandler(authController.changePassword));

export default router;
