import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { triggerBackup, getBackups } from './backups.controller.js';

const router = Router();

router.use(authenticate);

router.post('/', triggerBackup);
router.get('/', getBackups);

export default router;
