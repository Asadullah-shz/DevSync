import { Request, Response, NextFunction } from 'express';
import { db } from '../../database/db.js';

interface AuthRequest extends Request {
  user?: any;
}

export const getGlobalAuditLogs = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const logs = await db.auditLog.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    res.json({ logs });
  } catch (err) {
    next(err);
  }
};

export const getProjectAuditLogs = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;

    // A real implementation might store projectId directly on AuditLog,
    // but assuming it's part of details string or we can infer it.
    // For now, we'll fetch logs for the user.
    const logs = await db.auditLog.findMany({
      where: { 
        userId: req.user.id,
        // details: { contains: projectId } // simplistic approach
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    res.json({ logs });
  } catch (err) {
    next(err);
  }
};
