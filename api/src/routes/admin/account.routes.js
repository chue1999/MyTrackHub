import { Router } from 'express';
import * as accountController from '../../controllers/account.controller.js';
import { requireRole } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { accountIdParams, createAccountSchema, updateAccountSchema } from '../../validators/account.validator.js';

/** Admin website accounts — administrators only. */
const router = Router();
router.use(requireRole('admin'));

router.get('/', asyncHandler(accountController.list));
router.post('/', validate({ body: createAccountSchema }), asyncHandler(accountController.create));
router.patch(
  '/:id',
  validate({ params: accountIdParams, body: updateAccountSchema }),
  asyncHandler(accountController.update),
);
router.delete('/:id', validate({ params: accountIdParams }), asyncHandler(accountController.remove));

export default router;
