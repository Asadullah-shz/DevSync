import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '../../database/db.js';

interface AuthRequest extends Request {
  user?: any;
}

const createWorkspaceSchema = z.object({
  name: z.string().min(2).max(100),
});

const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['OWNER', 'ADMIN', 'EDITOR', 'VIEWER']).default('VIEWER'),
});

export const createWorkspace = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = createWorkspaceSchema.parse(req.body);
    const workspaceId = `WS-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const memberId = `WM-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    const workspace = await db.workspace.create({
      data: {
        id: workspaceId,
        name: data.name,
        members: {
          create: {
            id: memberId,
            userId: req.user.id,
            role: 'OWNER' // Creator is always the owner
          }
        }
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        }
      }
    });

    res.status(201).json({ workspace });
  } catch (err) {
    next(err);
  }
};

export const getWorkspaces = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const workspaces = await db.workspace.findMany({
      where: {
        members: {
          some: {
            userId: req.user.id
          }
        }
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ workspaces });
  } catch (err) {
    next(err);
  }
};

export const addWorkspaceMember = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id: workspaceId } = req.params;
    const data = addMemberSchema.parse(req.body);

    // Verify current user has admin rights to this workspace
    const currentMember = await db.workspaceMember.findFirst({
      where: { workspaceId, userId: req.user.id }
    });

    if (!currentMember || (currentMember.role !== 'OWNER' && currentMember.role !== 'ADMIN')) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }

    // Find the user to invite by email
    const invitee = await db.user.findUnique({ where: { email: data.email } });
    if (!invitee) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    // Check if already a member
    const existingMember = await db.workspaceMember.findFirst({
      where: { workspaceId, userId: invitee.id }
    });

    if (existingMember) {
      return res.status(400).json({ error: { message: 'User is already a member of this workspace' } });
    }

    const memberId = `WM-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const newMember = await db.workspaceMember.create({
      data: {
        id: memberId,
        workspaceId,
        userId: invitee.id,
        role: data.role,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    res.status(201).json({ member: newMember });
  } catch (err) {
    next(err);
  }
};

export const removeWorkspaceMember = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id: workspaceId, userId } = req.params;

    // Verify current user is admin/owner, OR they are removing themselves
    const currentMember = await db.workspaceMember.findFirst({
      where: { workspaceId, userId: req.user.id }
    });

    if (!currentMember) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }

    const isSelfRemoval = req.user.id === userId;
    const isAdmin = currentMember.role === 'OWNER' || currentMember.role === 'ADMIN';

    if (!isSelfRemoval && !isAdmin) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }

    // Cannot remove the only OWNER
    const targetMember = await db.workspaceMember.findFirst({
      where: { workspaceId, userId }
    });

    if (targetMember?.role === 'OWNER') {
      const ownerCount = await db.workspaceMember.count({
        where: { workspaceId, role: 'OWNER' }
      });
      if (ownerCount <= 1) {
        return res.status(400).json({ error: { message: 'Cannot remove the last owner of the workspace' } });
      }
    }

    if (targetMember) {
      await db.workspaceMember.delete({ where: { id: targetMember.id } });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
