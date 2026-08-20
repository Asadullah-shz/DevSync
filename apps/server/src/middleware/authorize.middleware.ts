import { Request, Response, NextFunction } from 'express';
import { db } from '../database/db.js';

interface AuthRequest extends Request {
  user?: any;
}

/**
 * Middleware to require specific roles for a workspace or project.
 * Ensure this is used AFTER the auth.middleware.js.
 */
export const requireRole = (allowedRoles: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: { message: 'Unauthorized' } });
      }

      const workspaceId = req.params.workspaceId;
      const projectId = req.params.projectId || (req.baseUrl.includes('/projects') ? req.params.id : undefined);

      let targetWorkspaceId = workspaceId;

      // If projectId is provided, we need to find its workspaceId
      if (projectId && !targetWorkspaceId) {
        const project = await db.project.findUnique({
          where: { id: projectId },
          select: { workspaceId: true },
        });

        if (!project) {
          return res.status(404).json({ error: { message: 'Project not found' } });
        }
        targetWorkspaceId = project.workspaceId;
      }

      if (!targetWorkspaceId) {
        return res.status(400).json({ error: { message: 'No workspace or project specified in request parameters' } });
      }

      const membership = await db.workspaceMember.findFirst({
        where: {
          workspaceId: targetWorkspaceId,
          userId: userId,
        },
      });

      if (!membership) {
        return res.status(403).json({ error: { message: 'Forbidden: You are not a member of this workspace' } });
      }

      if (!allowedRoles.includes(membership.role)) {
        return res.status(403).json({ error: { message: `Forbidden: Requires one of roles [${allowedRoles.join(', ')}]` } });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
