import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '../../database/db.js';

interface AuthRequest extends Request {
  user?: any;
}

const syncOperationSchema = z.object({
  deviceId: z.string(),
  clientCursor: z.string().optional(),
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

    
      if (op.type === 'CREATE' || op.type === 'MODIFY') {
        if (!op.hash || op.size === undefined) {
          throw new Error('CREATE/MODIFY operations require hash and size');
        }

     
        const fileIdRaw = `${projectId}:${op.path}`;
        const fileId = `FILE-${crypto.createHash('md5').update(fileIdRaw).digest('hex').substring(0, 8).toUpperCase()}`;

  
        const latestVersion = await db.fileVersion.findFirst({
          where: { fileId },
          orderBy: { version: 'desc' }
        });

        if (latestVersion && data.clientCursor) {
          const clientCursorDate = new Date(data.clientCursor);
          if (latestVersion.createdAt > clientCursorDate && latestVersion.deviceId !== data.deviceId) {
    
            const conflictId = `CONF-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
            await db.conflict.create({
              data: {
                id: conflictId,
                projectId,
                fileId,
                path: op.path,
                baseVersionHash: latestVersion.hash,
                incomingHash: op.hash,
                deviceA: latestVersion.deviceId,
                deviceB: data.deviceId,
                status: 'UNRESOLVED'
              }
            });
         
            await db.syncOperation.update({
              where: { id: syncOp.id },
              data: { status: 'CONFLICT' }
            });
            continue; 
          }
        }

    
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

 
    if (results.length > 0) {
      const snapshotId = `SNAP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      
      const snapshot = await db.snapshot.create({
        data: {
          id: snapshotId,
          projectId,
          createdBy: req.user.id,
        }
      });

 
      const activeFiles = await db.file.findMany({
        where: { projectId, isDeleted: false },
        include: { versions: { orderBy: { version: 'desc' }, take: 1 } }
      });

      const snapshotFiles = activeFiles.map(f => {
        const latestVersion = f.versions[0];
        return {
          id: `SF-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
          snapshotId,
          path: f.path,
          hash: f.hash,
          version: latestVersion ? latestVersion.version : 1
        };
      });

      if (snapshotFiles.length > 0) {
        await db.snapshotFile.createMany({ data: snapshotFiles });
      }
    }

 
    if (results.length > 0) {
      const { emitToProject } = await import('../../websocket/socket.js');
      emitToProject(projectId, 'PROJECT_UPDATED', {
        projectId,
        deviceId: data.deviceId,
        timestamp: new Date().toISOString()
      });
    }

    // Fetch any unresolved conflicts to return to the client
    const conflicts = await db.conflict.findMany({
      where: { projectId, status: 'UNRESOLVED' }
    });

    res.status(201).json({ success: true, processed: results.length, conflicts });
  } catch (err) {
    next(err);
  }
};

export const pullOperations = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    const { after } = req.query; 

 
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
      take: 1000 
    });

    res.json({ operations });
  } catch (err) {
    next(err);
  }
};
