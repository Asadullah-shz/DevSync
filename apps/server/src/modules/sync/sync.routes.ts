import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { processOperations, pullOperations } from './sync.controller.js';

const router = Router();

router.use(authenticate);

router.post('/operations/:projectId', processOperations);
router.get('/operations/:projectId', pullOperations);

export default router;
