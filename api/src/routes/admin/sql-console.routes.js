import { Router } from 'express';
import * as sqlController from '../../controllers/sql-console.controller.js';
import { requireRole } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { columnsQuery, connQuery, objectsQuery, runQuerySchema } from '../../validators/sql-console.validator.js';

/** SQL console (PostgreSQL + SQL Server) — administrators only. */
const router = Router();
router.use(requireRole('admin'));

router.get('/connections', asyncHandler(sqlController.connections));
router.get('/status', validate({ query: connQuery }), asyncHandler(sqlController.status));
router.get('/databases', validate({ query: connQuery }), asyncHandler(sqlController.databases));
router.get('/objects', validate({ query: objectsQuery }), asyncHandler(sqlController.objects));
router.get('/columns', validate({ query: columnsQuery }), asyncHandler(sqlController.columns));
router.post('/query', validate({ body: runQuerySchema }), asyncHandler(sqlController.query));

export default router;
