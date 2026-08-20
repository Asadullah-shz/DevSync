import { Request, Response, NextFunction } from 'express';

interface AuthRequest extends Request {
  user?: any;
}

export const requireSystemAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || !req.user.isSystemAdmin) {
    return res.status(403).json({ error: { message: 'Forbidden: System Admin access required' } });
  }
  next();
};
