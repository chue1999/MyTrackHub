import { Router } from 'express';
import * as ccareController from '../../controllers/ccare.controller.js';
import { requireCcareManage } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import {
  createSchema,
  listQuery,
  logsQuery,
  resetPasswordSchema,
  setActiveSchema,
  updateSchema,
  vasSubmitSchema,
} from '../../validators/ccare.validator.js';

/**
 * CCare staff accounts (Tb_User_detail). Any logged-in person may view the list;
 * only a CCare administrator (or a MyTPlus admin) may change accounts.
 */
const router = Router();

router.get('/users', validate({ query: listQuery }), asyncHandler(ccareController.list));
router.get('/users/:id', asyncHandler(ccareController.get));
// Vas Service operations: any signed-in CCare member (and admins) may run them.
router.post('/vas/submit', validate({ body: vasSubmitSchema }), asyncHandler(ccareController.vasSubmit));

router.use(requireCcareManage);
router.get('/users/:id/detail', asyncHandler(ccareController.detail));
router.get('/logs', validate({ query: logsQuery }), asyncHandler(ccareController.logs));
router.get('/logs/summary', asyncHandler(ccareController.logSummary));
router.get('/logs/:id', asyncHandler(ccareController.logDetail));
router.get('/log-actions', asyncHandler(ccareController.logActions));
router.post('/users', validate({ body: createSchema }), asyncHandler(ccareController.create));
router.patch('/users/:id', validate({ body: updateSchema }), asyncHandler(ccareController.update));
router.post(
  '/users/:id/password',
  validate({ body: resetPasswordSchema }),
  asyncHandler(ccareController.resetPassword),
);
router.post('/users/:id/active', validate({ body: setActiveSchema }), asyncHandler(ccareController.setActive));

export default router;
