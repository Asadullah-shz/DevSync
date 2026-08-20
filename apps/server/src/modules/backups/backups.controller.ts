import { Request, Response, NextFunction } from 'express';
import { db } from '../../database/db.js';
import { BackupService } from './backup.service.js';

interface AuthRequest extends Request {
  user?: any;
}

export const triggerBackup = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const backupJob = await db.backupJob.create({
      data: {
        id: `BCK-${Date.now()}`,
        status: 'IN_PROGRESS'
      }
    });

    // Run the backup asynchronously
    BackupService.runBackup(backupJob.id);

    res.status(202).json({ success: true, job: backupJob });
  } catch (err) {
    next(err);
  }
};

export const getBackups = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const backups = await db.backupJob.findMany({
      orderBy: { startedAt: 'desc' },
      take: 50
    });

    res.json({ backups });
  } catch (err) {
    next(err);
  }
};
