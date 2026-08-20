import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { getProjectVersions, getFileVersions, restoreFileVersion, getDeletedFiles, restoreDeletedFile } from './versions.controller.js';

const router = Router();

router.use(authenticate);

router.get('/:projectId/versions', getProjectVersions);
router.get('/:projectId/files/:fileId/versions', getFileVersions);
router.post('/:projectId/files/restore', restoreFileVersion);
router.get('/:projectId/deleted', getDeletedFiles);
router.post('/:projectId/files/:fileId/restore', restoreDeletedFile);

export default router;
