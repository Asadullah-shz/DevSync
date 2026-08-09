import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  createWorkspace,
  getWorkspaces,
  addWorkspaceMember,
  removeWorkspaceMember
} from './workspaces.controller.js';

const router = Router();

router.use(authenticate);

router.post('/', createWorkspace);
router.get('/', getWorkspaces);
router.post('/:id/members', addWorkspaceMember);
router.delete('/:id/members/:userId', removeWorkspaceMember);

export default router;
