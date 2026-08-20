import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../../database/db.js';
import fsPromises from 'fs/promises';
import path from 'path';

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

    const file = await db.file.findUnique({ where: { id: conflict.fileId } });
    if (!file) {
      return res.status(404).json({ error: { message: 'File not found' } });
    }

    let resolvedFile = null;

    if (data.resolution === 'KEEP_SERVER') {
      // Keep server version: DB status is updated, but file stays identical on the server.
      // Conflicting client must download the current server version.
    } else if (data.resolution === 'KEEP_MINE') {
      // Keep client version: Client's version overwrites server's active file version.
      const hash = data.resolvedHash || conflict.incomingHash;
      if (!hash) {
        return res.status(400).json({ error: { message: 'No incoming or resolved hash provided' } });
      }

      // Fetch size of the stored object from CAS
      let size = 0;
      try {
        const prefix = hash.substring(0, 2);
        const objectPath = path.join(process.cwd(), 'storage', 'objects', prefix, hash);
        const stats = await fsPromises.stat(objectPath);
        size = stats.size;
      } catch (err) {
        return res.status(400).json({ error: { message: 'Conflicting file content object not found in server storage' } });
      }

      // Create new FileVersion
      const latestVersion = await db.fileVersion.findFirst({
        where: { fileId: file.id },
        orderBy: { version: 'desc' }
      });
      const nextVersionNum = (latestVersion?.version || 0) + 1;

      await db.fileVersion.create({
        data: {
          id: `VER-${Date.now()}`,
          fileId: file.id,
          hash: hash,
          size: size,
          version: nextVersionNum,
          createdBy: req.user.id,
          deviceId: conflict.deviceB
        }
      });

      // Update active File metadata
      await db.file.update({
        where: { id: file.id },
        data: {
          hash: hash,
          size: size,
          modifiedAt: new Date()
        }
      });

      resolvedFile = { id: file.id, path: file.path, hash, size };

    } else if (data.resolution === 'KEEP_BOTH') {
      // Keep both versions: Original file stays as is, and the client's conflicting change
      // is saved under a conflict-renamed path (e.g. src/index_conflict_7F3A9.js).
      const hash = data.resolvedHash || conflict.incomingHash;
      if (!hash) {
        return res.status(400).json({ error: { message: 'No incoming or resolved hash provided' } });
      }

      // Fetch size from CAS
      let size = 0;
      try {
        const prefix = hash.substring(0, 2);
        const objectPath = path.join(process.cwd(), 'storage', 'objects', prefix, hash);
        const stats = await fsPromises.stat(objectPath);
        size = stats.size;
      } catch (err) {
        return res.status(400).json({ error: { message: 'Conflicting file content object not found in server storage' } });
      }

      // Compute conflict-renamed path
      const ext = path.extname(file.path);
      const base = file.path.substring(0, file.path.length - ext.length);
      const shortDeviceB = conflict.deviceB.substring(Math.max(0, conflict.deviceB.length - 8));
      const conflictPath = `${base}_conflict_${shortDeviceB}${ext}`;

      // Create new File
      const newFileId = `FIL-${Date.now()}`;
      await db.file.create({
        data: {
          id: newFileId,
          projectId: conflict.projectId,
          path: conflictPath,
          hash: hash,
          size: size,
          modifiedAt: new Date()
        }
      });

      // Create FileVersion for this new renamed file
      await db.fileVersion.create({
        data: {
          id: `VER-${Date.now()}`,
          fileId: newFileId,
          hash: hash,
          size: size,
          version: 1,
          createdBy: req.user.id,
          deviceId: conflict.deviceB
        }
      });

      resolvedFile = { id: newFileId, path: conflictPath, hash, size };
    }

    const resolved = await db.conflict.update({
      where: { id: conflictId },
      data: { status: 'RESOLVED' }
    });

    res.json({ success: true, conflict: resolved, resolvedFile });
  } catch (err) {
    next(err);
  }
};
