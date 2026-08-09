import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  createProject,
  getProjects,
  getProjectById,
  deleteProject
} from './projects.controller.js';

const router = Router();

router.use(authenticate);

router.post('/', createProject);
router.get('/', getProjects);
router.get('/:id', getProjectById);
router.delete('/:id', deleteProject);

export default router;
