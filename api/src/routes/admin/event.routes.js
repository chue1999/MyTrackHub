import { Router } from 'express';
import * as eventController from '../../controllers/event.controller.js';
import { asyncHandler } from '../../utils/async-handler.js';

/** The activity log. */
const router = Router();

router.get('/', asyncHandler(eventController.list));
router.get('/:id', asyncHandler(eventController.detail));

export default router;
