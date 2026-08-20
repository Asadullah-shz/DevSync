import { Request, Response, NextFunction } from 'express';
import { scanStorage } from './integrity.service.js';
import { getStorageStats } from './resource-monitor.service.js';

interface AuthRequest extends Request {
  user?: any;
}

export const verifyStorage = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await scanStorage();
    res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
};

export const storageStats = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const stats = await getStorageStats();
    res.json({ success: true, stats });
  } catch (err) {
    next(err);
  }
};

