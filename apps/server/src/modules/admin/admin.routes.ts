import { Router } from 'express';
import { getUsers, promoteUser, getWorkspaces, getSystemMetrics } from './admin.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { requireSystemAdmin } from '../../middleware/admin.middleware.js';

const router = Router();

// All admin routes require authentication and System Admin privileges
router.use(authenticate, requireSystemAdmin);

router.get('/users', getUsers);
router.post('/users/:userId/promote', promoteUser);

router.get('/workspaces', getWorkspaces);

router.get('/metrics', getSystemMetrics);

export default router;
