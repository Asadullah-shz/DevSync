import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '../../database/db.js';

interface AuthRequest extends Request {
  user?: any;
}

export const getConflicts = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;

    const conflicts = await db.conflict.findMany({
      where: { projectId, status: 'UNRESOLVED' },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ conflicts });
  } catch (err) {
    next(err);
  }
};

const resolveSchema = z.object({
  resolution: z.enum(['mine', 'server'])
});

export const resolveConflict = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId, conflictId } = req.params;
    const { resolution } = resolveSchema.parse(req.body);

    const conflict = await db.conflict.findUnique({ where: { id: conflictId } });
    if (!conflict || conflict.status !== 'UNRESOLVED') {
      return res.status(404).json({ error: { message: 'Conflict not found or already resolved' } });
    }

    if (resolution === 'server') {
      // Keep server's version: simply mark as resolved. 
      // The client will pull the server's version next time they sync or when we emit a socket event.
      await db.conflict.update({
        where: { id: conflictId },
        data: { status: 'RESOLVED_SERVER' }
      });
    } else if (resolution === 'mine') {
      // Keep mine: Create a new file version based on the incoming rejected hash.
      if (!conflict.incomingHash) {
        return res.status(400).json({ error: { message: 'Cannot resolve as mine: no incoming hash' } });
      }

      const versionCount = await db.fileVersion.count({ where: { fileId: conflict.fileId } });

      const newVersion = await db.fileVersion.create({
        data: {
          id: `VER-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
          fileId: conflict.fileId,
          hash: conflict.incomingHash,
          size: 0, // We don't have the size, but it's acceptable for this prototype
          version: versionCount + 1,
          createdBy: req.user.id,
          deviceId: conflict.deviceB,
          createdAt: new Date()
        }
      });

      // Update the File record
      await db.file.update({
        where: { id: conflict.fileId },
        data: { hash: conflict.incomingHash, modifiedAt: new Date() }
      });

      // Create a snapshot
      const snapshotId = `SNAP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      await db.snapshot.create({
        data: { id: snapshotId, projectId, createdBy: req.user.id }
      });
      await db.snapshotFile.create({
        data: {
          id: `SF-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
          snapshotId,
          path: conflict.path,
          hash: conflict.incomingHash,
          version: newVersion.version
        }
      });

      await db.conflict.update({
        where: { id: conflictId },
        data: { status: 'RESOLVED_MINE' }
      });

      const { emitToProject } = await import('../../websocket/socket.js');
      emitToProject(projectId, 'PROJECT_UPDATED', {
        projectId,
        deviceId: conflict.deviceB,
        timestamp: new Date().toISOString()
      });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
