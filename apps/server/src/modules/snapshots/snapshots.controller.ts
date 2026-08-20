import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../../database/db.js';

interface AuthRequest extends Request {
  user?: any;
}

const restoreSnapshotSchema = z.object({
  snapshotId: z.string()
});

export const createSnapshot = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;

    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: { message: 'Project not found' } });

    // Find all active (non-deleted) files in the project
    const currentFiles = await db.file.findMany({
      where: { projectId, isDeleted: false },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1
        }
      }
    });

    const snapshotId = `SNAP-${Date.now()}`;

    // Transaction to ensure atomicity
    const snapshot = await db.$transaction(async (prisma) => {
      const snap = await prisma.snapshot.create({
        data: {
          id: snapshotId,
          projectId,
          createdBy: req.user.id
        }
      });

      const snapshotFilesData = currentFiles.map(file => {
        const latestVersion = file.versions[0];
        return {
          id: `SF-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          snapshotId: snap.id,
          path: file.path,
          hash: file.hash,
          version: latestVersion ? latestVersion.version : 1
        };
      });

      if (snapshotFilesData.length > 0) {
        await prisma.snapshotFile.createMany({
          data: snapshotFilesData
        });
      }

      return snap;
    });

    res.status(201).json({ snapshot });
  } catch (err) {
    next(err);
  }
};

export const getSnapshots = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;

    const snapshots = await db.snapshot.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ snapshots });
  } catch (err) {
    next(err);
  }
};

export const getSnapshotById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { snapshotId } = req.params;

    const snapshot = await db.snapshot.findUnique({
      where: { id: snapshotId },
      include: { files: true }
    });

    if (!snapshot) return res.status(404).json({ error: { message: 'Snapshot not found' } });

    res.json({ snapshot });
  } catch (err) {
    next(err);
  }
};

export const restoreSnapshot = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    const data = restoreSnapshotSchema.parse(req.body);

    const snapshot = await db.snapshot.findUnique({
      where: { id: data.snapshotId },
      include: { files: true }
    });

    if (!snapshot || snapshot.projectId !== projectId) {
      return res.status(404).json({ error: { message: 'Snapshot not found' } });
    }

    // A real restore would need to delete files created since the snapshot,
    // and revert modified files back to the snapshot's state.
    // For now, we will mark all current files as deleted, then "create/update" from snapshot.
    // This requires a complex transaction in a real app, here is a simplified version:

    await db.$transaction(async (prisma) => {
      // 1. Mark all active files as deleted
      await prisma.file.updateMany({
        where: { projectId },
        data: { isDeleted: true }
      });

      // 2. Re-activate and update files from snapshot
      for (const snapFile of snapshot.files) {
        const existingFile = await prisma.file.findFirst({
          where: { projectId, path: snapFile.path }
        });

        if (existingFile) {
          await prisma.file.update({
            where: { id: existingFile.id },
            data: {
              hash: snapFile.hash,
              isDeleted: false,
              modifiedAt: new Date()
            }
          });
        } else {
          // It's possible the file record was completely deleted, though we use soft deletes
          // So this is just a fallback
          await prisma.file.create({
            data: {
              id: `F-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              projectId,
              path: snapFile.path,
              hash: snapFile.hash,
              size: 0, // In a real scenario, snapshot file needs to store size
              modifiedAt: new Date()
            }
          });
        }
      }
    });

    res.json({ success: true, message: 'Snapshot restored successfully' });
  } catch (err) {
    next(err);
  }
};
