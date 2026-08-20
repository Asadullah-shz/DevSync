import { Router } from 'express';
import { getUsers, promoteUser, getWorkspaces, getSystemMetrics, getDevices, updateDeviceStatus } from './admin.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { requireSystemAdmin } from '../../middleware/admin.middleware.js';

const router = Router();


router.use(authenticate, requireSystemAdmin);

router.get('/users', getUsers);
router.post('/users/:userId/promote', promoteUser);

router.get('/workspaces', getWorkspaces);

router.get('/metrics', getSystemMetrics);

router.get('/devices', getDevices);
router.patch('/devices/:deviceId/status', updateDeviceStatus);

export default router;
