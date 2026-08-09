import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '../../database/db.js';

interface AuthRequest extends Request {
  user?: any;
}

const createProjectSchema = z.object({
  name: z.string().min(2).max(100),
  workspaceId: z.string(),
});

export const createProject = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = createProjectSchema.parse(req.body);

    // Verify user is a member of the workspace
    const member = await db.workspaceMember.findFirst({
      where: { workspaceId: data.workspaceId, userId: req.user.id }
    });

    if (!member) {
      return res.status(403).json({ error: { message: 'Forbidden: You are not a member of this workspace' } });
    }

    const projectId = `PRJ-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    const project = await db.project.create({
      data: {
        id: projectId,
        name: data.name,
        workspaceId: data.workspaceId,
      }
    });

    res.status(201).json({ project });
  } catch (err) {
    next(err);
  }
};

export const getProjects = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Get all projects for all workspaces the user is a member of
    const projects = await db.project.findMany({
      where: {
        workspace: {
          members: {
            some: {
              userId: req.user.id
            }
          }
        }
      },
      include: {
        workspace: {
          select: { id: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ projects });
  } catch (err) {
    next(err);
  }
};

export const getProjectById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const project = await db.project.findUnique({
      where: { id },
      include: {
        workspace: {
          select: { id: true, name: true }
        },
        projectDevices: {
          include: {
            device: {
              select: { id: true, deviceName: true, status: true }
            }
          }
        }
      }
    });

    if (!project) {
      return res.status(404).json({ error: { message: 'Project not found' } });
    }

    // Verify user is a member of the workspace this project belongs to
    const member = await db.workspaceMember.findFirst({
      where: { workspaceId: project.workspaceId, userId: req.user.id }
    });

    if (!member) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }

    res.json({ project });
  } catch (err) {
    next(err);
  }
};

export const deleteProject = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const project = await db.project.findUnique({ where: { id } });
    if (!project) {
      return res.status(404).json({ error: { message: 'Project not found' } });
    }

    // Only OWNER or ADMIN of the workspace can delete projects
    const member = await db.workspaceMember.findFirst({
      where: { workspaceId: project.workspaceId, userId: req.user.id }
    });

    if (!member || (member.role !== 'OWNER' && member.role !== 'ADMIN')) {
      return res.status(403).json({ error: { message: 'Forbidden: Admin rights required to delete project' } });
    }

    // Due to relations, we need to delete or cascade. For V1 we just delete the project.
    // If Prisma is set to Restrict, we would need to delete related records first.
    // Let's assume Prisma doesn't block it or we do it manually.
    await db.projectDevice.deleteMany({ where: { projectId: id } });
    await db.project.delete({ where: { id } });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
