import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { createSnapshot, getSnapshots, getSnapshotById, restoreSnapshot } from './snapshots.controller.js';

const router = Router();

router.use(authenticate);

router.post('/:projectId/snapshots', createSnapshot);
router.get('/:projectId/snapshots', getSnapshots);
router.get('/:projectId/snapshots/:snapshotId', getSnapshotById);
router.post('/:projectId/restore', restoreSnapshot);

export default router;
