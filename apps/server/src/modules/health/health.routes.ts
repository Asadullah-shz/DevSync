import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { getLiveness, getReadiness, getMetrics } from './health.controller.js';

const router = Router();

router.get('/', getLiveness);
router.get('/ready', getReadiness);
router.get('/metrics', authenticate, getMetrics);

export default router;
