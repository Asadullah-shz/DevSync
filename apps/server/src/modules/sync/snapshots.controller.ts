import { Request, Response, NextFunction } from 'express';
import { db } from '../../database/db.js';

interface AuthRequest extends Request {
  user?: any;
}

export const getVersions = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    
    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: { message: 'Project not found' } });

    const member = await db.workspaceMember.findFirst({
      where: { workspaceId: project.workspaceId, userId: req.user.id }
    });
    if (!member) return res.status(403).json({ error: { message: 'Forbidden' } });

    const versions = await db.fileVersion.findMany({
      where: { file: { projectId } },
      include: {
        file: { select: { path: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    const userIds = [...new Set(versions.map(v => v.createdBy))];
    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true }
    });

    const userMap = new Map(users.map(u => [u.id, u]));

    const enrichedVersions = versions.map(v => ({
      ...v,
      user: userMap.get(v.createdBy) || null
    }));

    res.json({ versions: enrichedVersions });
  } catch (err) {
    next(err);
  }
};

export const getSnapshots = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    
    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: { message: 'Project not found' } });

    const member = await db.workspaceMember.findFirst({
      where: { workspaceId: project.workspaceId, userId: req.user.id }
    });
    if (!member) return res.status(403).json({ error: { message: 'Forbidden' } });

    const snapshots = await db.snapshot.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    res.json({ snapshots });
  } catch (err) {
    next(err);
  }
};
