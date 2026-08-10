import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../database/db.js';

interface AuthRequest extends Request {
  user?: any;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: { message: 'Unauthorized' } });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;

    const user = await db.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      return res.status(401).json({ error: { message: 'Unauthorized' } });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }
};
