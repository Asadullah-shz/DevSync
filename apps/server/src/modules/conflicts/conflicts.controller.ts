import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../../database/db.js';

interface AuthRequest extends Request {
  user?: any;
}

const resolveConflictSchema = z.object({
  resolution: z.enum(['KEEP_MINE', 'KEEP_SERVER', 'KEEP_BOTH']),
  resolvedHash: z.string().optional() // Provided if client does a 3-way merge
});

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

export const resolveConflict = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId, conflictId } = req.params;
    const data = resolveConflictSchema.parse(req.body);

    const conflict = await db.conflict.findUnique({ where: { id: conflictId, projectId } });
    if (!conflict || conflict.status !== 'UNRESOLVED') {
      return res.status(404).json({ error: { message: 'Active conflict not found' } });
    }

    // In a full implementation, we'd process KEEP_MINE, KEEP_SERVER, KEEP_BOTH
    // and update the file version accordingly. For now, we just mark it resolved.
    
    // Example pseudo-logic:
    // if (data.resolution === 'KEEP_MINE') {
    //    const newVersion = await db.fileVersion.create({ ... })
    //    await db.file.update({ hash: ... })
    // }

    const resolved = await db.conflict.update({
      where: { id: conflictId },
      data: { status: 'RESOLVED' }
    });

    res.json({ success: true, conflict: resolved });
  } catch (err) {
    next(err);
  }
};
