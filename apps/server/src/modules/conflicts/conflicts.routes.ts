import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { getConflicts, resolveConflict } from './conflicts.controller.js';

const router = Router();

router.use(authenticate);

router.get('/:projectId/conflicts', getConflicts);
router.post('/:projectId/conflicts/:conflictId/resolve', resolveConflict);

export default router;
