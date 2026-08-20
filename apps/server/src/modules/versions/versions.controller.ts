import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../../database/db.js';

interface AuthRequest extends Request {
  user?: any;
}

const restoreFileSchema = z.object({
  fileId: z.string(),
  versionId: z.string()
});

export const getProjectVersions = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;

    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: { message: 'Project not found' } });

    const history = await db.fileVersion.findMany({
      where: { file: { projectId } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        file: { select: { path: true } }
      }
    });

    const userIds = [...new Set(history.map(h => h.createdBy))];
    const deviceIds = [...new Set(history.map(h => h.deviceId))];

    const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } });
    const devices = await db.device.findMany({ where: { id: { in: deviceIds } }, select: { id: true, deviceName: true, platform: true } });

    const userMap = new Map(users.map(u => [u.id, u]));
    const deviceMap = new Map(devices.map(d => [d.id, d]));

    const enrichedHistory = history.map(h => ({
      ...h,
      user: userMap.get(h.createdBy) || null,
      device: deviceMap.get(h.deviceId) || null
    }));

    res.json({ history: enrichedHistory });
  } catch (err) {
    next(err);
  }
};

export const getFileVersions = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId, fileId } = req.params;

    const file = await db.file.findUnique({ where: { id: fileId, projectId } });
    if (!file) return res.status(404).json({ error: { message: 'File not found' } });

    const versions = await db.fileVersion.findMany({
      where: { fileId },
      orderBy: { version: 'desc' }
    });

    res.json({ versions });
  } catch (err) {
    next(err);
  }
};

export const restoreFileVersion = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    const data = restoreFileSchema.parse(req.body);

    const file = await db.file.findUnique({ where: { id: data.fileId, projectId } });
    if (!file) return res.status(404).json({ error: { message: 'File not found' } });

    const versionToRestore = await db.fileVersion.findUnique({ where: { id: data.versionId } });
    if (!versionToRestore || versionToRestore.fileId !== file.id) {
      return res.status(404).json({ error: { message: 'Version not found for this file' } });
    }

    // Update the file to point to the restored version's state
    const updatedFile = await db.file.update({
      where: { id: file.id },
      data: {
        hash: versionToRestore.hash,
        size: versionToRestore.size,
        modifiedAt: new Date(),
        isDeleted: false
      }
    });

    // Create a new version record for this restoration event
    const latestVersion = await db.fileVersion.findFirst({
      where: { fileId: file.id },
      orderBy: { version: 'desc' }
    });
    
    const newVersionNumber = (latestVersion?.version || 0) + 1;

    const newVersion = await db.fileVersion.create({
      data: {
        id: `VER-${Date.now()}`,
        fileId: file.id,
        hash: updatedFile.hash,
        size: updatedFile.size,
        version: newVersionNumber,
        createdBy: req.user.id,
        deviceId: 'RESTORE-SYSTEM' // This should be provided in the request by the client
      }
    });

    res.json({ file: updatedFile, version: newVersion });
  } catch (err) {
    next(err);
  }
};

export const getDeletedFiles = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;

    const files = await db.file.findMany({
      where: { projectId, isDeleted: true },
      orderBy: { updatedAt: 'desc' }
    });

    res.json({ files });
  } catch (err) {
    next(err);
  }
};

export const restoreDeletedFile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId, fileId } = req.params;

    const file = await db.file.findUnique({ where: { id: fileId, projectId } });
    if (!file) return res.status(404).json({ error: { message: 'File not found' } });
    
    if (!file.isDeleted) {
      return res.status(400).json({ error: { message: 'File is not deleted' } });
    }

    // Update the file to be undeleted
    const updatedFile = await db.file.update({
      where: { id: file.id },
      data: {
        modifiedAt: new Date(),
        isDeleted: false
      }
    });

    // Create a new version record for this restoration event
    const latestVersion = await db.fileVersion.findFirst({
      where: { fileId: file.id },
      orderBy: { version: 'desc' }
    });
    
    const newVersionNumber = (latestVersion?.version || 0) + 1;

    const newVersion = await db.fileVersion.create({
      data: {
        id: `VER-${Date.now()}`,
        fileId: file.id,
        hash: updatedFile.hash,
        size: updatedFile.size,
        version: newVersionNumber,
        createdBy: req.user.id,
        deviceId: 'RESTORE-SYSTEM'
      }
    });

    res.json({ file: updatedFile, version: newVersion });
  } catch (err) {
    next(err);
  }
};
