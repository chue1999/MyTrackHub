import { Router } from 'express';
import * as aiController from '../../controllers/ai.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { askSchema, renameSchema } from '../../validators/ai.validator.js';

/** AI chat for every signed-in person (MyTPlus admins and CCare accounts). Each sees only their own history. */
const router = Router();

router.get('/providers', aiController.providers);
router.get('/conversations', asyncHandler(aiController.list));
router.get('/conversations/:id', asyncHandler(aiController.get));
router.patch('/conversations/:id', validate({ body: renameSchema }), asyncHandler(aiController.rename));
router.post('/ask', validate({ body: askSchema }), asyncHandler(aiController.ask));

export default router;
