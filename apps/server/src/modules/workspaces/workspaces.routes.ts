import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  createWorkspace,
  getWorkspaces,
  addWorkspaceMember,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
  updateWorkspacePolicies
} from './workspaces.controller.js';

const router = Router();

router.use(authenticate);

router.post('/', createWorkspace);
router.get('/', getWorkspaces);
router.post('/:id/members', addWorkspaceMember);
router.put('/:id/members/:userId', updateWorkspaceMemberRole);
router.delete('/:id/members/:userId', removeWorkspaceMember);
router.patch('/:id/policies', updateWorkspacePolicies);

export default router;
