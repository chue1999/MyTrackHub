import { Router } from 'express';
import * as serverLogController from '../controllers/server-log.controller.js';
import * as serverController from '../controllers/server.controller.js';
import { requireAgentKey } from '../middlewares/auth.middleware.js';
import { agentLimiter } from '../middlewares/rate-limit.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';
import { agentTasksQuery, ingestSchema, taskResultSchema } from '../validators/server-log.validator.js';

/** Server agent → API (header `x-agent-key`). Mounted at /api/v1/server-agent. */
const router = Router();

router.post(
  '/events',
  agentLimiter,
  requireAgentKey,
  validate({ body: ingestSchema }),
  asyncHandler(serverLogController.ingest),
);

// Cache-clear requests from the web: the agent picks them up and reports back.
router.get(
  '/tasks',
  agentLimiter,
  requireAgentKey,
  validate({ query: agentTasksQuery }),
  asyncHandler(serverController.agentTasks),
);
router.post(
  '/tasks/:id/result',
  agentLimiter,
  requireAgentKey,
  validate({ body: taskResultSchema }),
  asyncHandler(serverController.agentTaskResult),
);

export default router;
