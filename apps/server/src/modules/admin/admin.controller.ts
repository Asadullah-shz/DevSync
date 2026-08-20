import { Request, Response, NextFunction } from 'express';
import { db } from '../../database/db.js';

export const getUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await db.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        isSystemAdmin: true,
        createdAt: true,
        ssoProvider: true,
      },
    });
    res.json({ users });
  } catch (err) {
    next(err);
  }
};

export const promoteUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    const user = await db.user.update({
      where: { id: userId },
      data: { isSystemAdmin: true },
      select: { id: true, email: true, isSystemAdmin: true }
    });
    res.json({ message: 'User promoted to System Admin', user });
  } catch (err) {
    next(err);
  }
};

export const getWorkspaces = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaces = await db.workspace.findMany({
      include: {
        _count: {
          select: { members: true, projects: true }
        }
      }
    });
    res.json({ workspaces });
  } catch (err) {
    next(err);
  }
};

export const getSystemMetrics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const totalUsers = await db.user.count();
    const totalWorkspaces = await db.workspace.count();
    const totalDevices = await db.device.count();
    const totalProjects = await db.project.count();
    
    res.json({
      metrics: {
        totalUsers,
        totalWorkspaces,
        totalDevices,
        totalProjects
      }
    });
  } catch (err) {
    next(err);
  }
};

export const getDevices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const devices = await db.device.findMany({
      include: {
        user: { select: { email: true, name: true } }
      }
    });
    res.json({ devices });
  } catch (err) {
    next(err);
  }
};

export const updateDeviceStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { deviceId } = req.params;
    const { status } = req.body; // APPROVED | REJECTED | PENDING
    const device = await db.device.update({
      where: { id: deviceId },
      data: { status }
    });
    res.json({ message: `Device status updated to ${status}`, device });
  } catch (err) {
    next(err);
  }
};
