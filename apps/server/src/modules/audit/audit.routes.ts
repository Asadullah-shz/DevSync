import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { getGlobalAuditLogs, getProjectAuditLogs } from './audit.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', getGlobalAuditLogs);
router.get('/project/:projectId', getProjectAuditLogs);

export default router;
