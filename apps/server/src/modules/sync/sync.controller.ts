import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '../../database/db.js';

interface AuthRequest extends Request {
  user?: any;
}

const syncOperationSchema = z.object({
  deviceId: z.string(),
  operations: z.array(z.object({
    type: z.enum(['CREATE', 'MODIFY', 'DELETE', 'RENAME']),
    path: z.string(),
    hash: z.string().optional(),
    size: z.number().optional(),
    timestamp: z.string().datetime(),
  }))
});

export const processOperations = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    const data = syncOperationSchema.parse(req.body);

    // Verify user is part of the workspace that owns this project
    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: { message: 'Project not found' } });

    const member = await db.workspaceMember.findFirst({
      where: { workspaceId: project.workspaceId, userId: req.user.id }
    });
    if (!member) return res.status(403).json({ error: { message: 'Forbidden' } });

    const results = [];

    // Process each operation sequentially for safety, though a transaction would be better in prod
    for (const op of data.operations) {
      const opId = `OP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      
      // Upsert the SyncOperation record
      const syncOp = await db.syncOperation.create({
        data: {
          id: opId,
          projectId,
          deviceId: data.deviceId,
          userId: req.user.id,
          type: op.type,
          path: op.path,
          hash: op.hash,
          status: 'APPLIED',
          createdAt: new Date(op.timestamp)
        }
      });

      // Update the File and FileVersion records
      if (op.type === 'CREATE' || op.type === 'MODIFY') {
        if (!op.hash || op.size === undefined) {
          throw new Error('CREATE/MODIFY operations require hash and size');
        }

        // Generate consistent File ID based on project and path
        const fileIdRaw = `${projectId}:${op.path}`;
        const fileId = `FILE-${crypto.createHash('md5').update(fileIdRaw).digest('hex').substring(0, 8).toUpperCase()}`;

        // Upsert file
        const file = await db.file.upsert({
          where: { id: fileId },
          create: {
            id: fileId,
            projectId,
            path: op.path,
            hash: op.hash,
            size: op.size,
            modifiedAt: new Date(op.timestamp),
            isDeleted: false
          },
          update: {
            hash: op.hash,
            size: op.size,
            modifiedAt: new Date(op.timestamp),
            isDeleted: false
          }
        });

        // Get current version count to increment
        const versionCount = await db.fileVersion.count({ where: { fileId } });

        // Add file version
        await db.fileVersion.create({
          data: {
            id: `VER-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
            fileId,
            hash: op.hash,
            size: op.size,
            version: versionCount + 1,
            createdBy: req.user.id,
            deviceId: data.deviceId,
            createdAt: new Date(op.timestamp)
          }
        });
      } else if (op.type === 'DELETE') {
        const fileIdRaw = `${projectId}:${op.path}`;
        const fileId = `FILE-${crypto.createHash('md5').update(fileIdRaw).digest('hex').substring(0, 8).toUpperCase()}`;

        await db.file.updateMany({
          where: { id: fileId },
          data: { isDeleted: true, modifiedAt: new Date(op.timestamp) }
        });
      }

      results.push(syncOp.id);
    }

    res.status(201).json({ success: true, processed: results.length });
  } catch (err) {
    next(err);
  }
};

export const pullOperations = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    const { after } = req.query; // Timestamp cursor

    // Verify user is part of the workspace
    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: { message: 'Project not found' } });

    const member = await db.workspaceMember.findFirst({
      where: { workspaceId: project.workspaceId, userId: req.user.id }
    });
    if (!member) return res.status(403).json({ error: { message: 'Forbidden' } });

    const whereClause: any = { projectId };
    if (after && typeof after === 'string') {
      whereClause.createdAt = { gt: new Date(after) };
    }

    const operations = await db.syncOperation.findMany({
      where: whereClause,
      orderBy: { createdAt: 'asc' },
      take: 1000 // Limit to prevent massive payloads
    });

    res.json({ operations });
  } catch (err) {
    next(err);
  }
};
