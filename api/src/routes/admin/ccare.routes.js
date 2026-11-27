import { Router } from 'express';
import * as ccareController from '../../controllers/ccare.controller.js';
import * as tplusController from '../../controllers/tplus.controller.js';
import { requireCcareManage } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import logCleanupRoutes from './log-cleanup.routes.js';
import {
  createSchema,
  listQuery,
  logsClearQuery,
  logsQuery,
  resetPasswordSchema,
  setActiveSchema,
  updateSchema,
  vasSubmitSchema,
} from '../../validators/ccare.validator.js';
import {
  esimRegisterSchema,
  niceConfirmSchema,
  poolApproveSchema,
  poolQuery,
  searchQuery,
} from '../../validators/tplus.validator.js';

/**
 * CCare staff accounts (Tb_User_detail). Any logged-in person may view the list;
 * only a CCare administrator (or a MyTPlus admin) may change accounts.
 */
const router = Router();

router.get('/brands', ccareController.brands);
router.get('/users', validate({ query: listQuery }), asyncHandler(ccareController.list));
router.get('/users/:id', asyncHandler(ccareController.get));
// Vas Service operations: any signed-in CCare member (and admins) may run them.
router.post('/vas/submit', validate({ body: vasSubmitSchema }), asyncHandler(ccareController.vasSubmit));

// TPLUS service pages (Register E-SIM, Nice Number, Pool, Import IMSI). Example
// data + activity logging now; the real telecom APIs are wired later.
router.get('/tplus/esim/next', asyncHandler(tplusController.esimNext));
router.post('/tplus/esim/register', validate({ body: esimRegisterSchema }), asyncHandler(tplusController.esimRegister));
router.get('/tplus/nice', validate({ query: searchQuery }), asyncHandler(tplusController.niceList));
router.post('/tplus/nice/confirm', validate({ body: niceConfirmSchema }), asyncHandler(tplusController.niceConfirm));
router.get('/tplus/pool', validate({ query: poolQuery }), asyncHandler(tplusController.poolList));
router.post('/tplus/pool/approve', validate({ body: poolApproveSchema }), asyncHandler(tplusController.poolApprove));

router.use(requireCcareManage);
router.get('/users/:id/detail', asyncHandler(ccareController.detail));
router.get('/logs', validate({ query: logsQuery }), asyncHandler(ccareController.logs));
router.get('/logs/summary', asyncHandler(ccareController.logSummary));
router.delete('/logs', validate({ query: logsClearQuery }), asyncHandler(ccareController.logsClear));
// Delete logs older than N days (before /logs/:id so "cleanup" is not taken for an id).
router.use('/logs-cleanup', requireCcareManage, logCleanupRoutes);
router.get('/logs/:id', asyncHandler(ccareController.logDetail));
router.delete('/logs/:id', asyncHandler(ccareController.logDelete));
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
