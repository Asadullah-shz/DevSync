import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '../../database/db.js';

interface AuthRequest extends Request {
  user?: any;
}

const registerDeviceSchema = z.object({
  deviceName: z.string().min(1),
  hostname: z.string(),
  platform: z.string(),
  platformVersion: z.string(),
  appVersion: z.string(),
  publicKey: z.string(), // Cryptographic public key
});

const updateDeviceSchema = z.object({
  deviceName: z.string().min(1).optional(),
  status: z.enum(["PENDING", "ACTIVE", "OFFLINE", "REVOKED"]).optional(),
});

export const registerDevice = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = registerDeviceSchema.parse(req.body);
    const userId = req.user.id; // From auth middleware

    const deviceId = `DEV-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const keyId = `KEY-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    const device = await db.device.create({
      data: {
        id: deviceId,
        userId: userId,
        deviceName: data.deviceName,
        hostname: data.hostname,
        platform: data.platform,
        platformVersion: data.platformVersion,
        appVersion: data.appVersion,
        lastIp: req.ip,
        status: "ACTIVE", // Auto-activate for now
        deviceKeys: {
          create: {
            id: keyId,
            publicKey: data.publicKey,
          }
        }
      },
      include: {
        deviceKeys: true,
      }
    });

    res.status(201).json({ device });
  } catch (err) {
    next(err);
  }
};

export const getDevices = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const devices = await db.device.findMany({
      where: { userId: req.user.id },
      include: { deviceKeys: true },
      orderBy: { lastSeenAt: 'desc' }
    });
    res.json({ devices });
  } catch (err) {
    next(err);
  }
};

export const getDeviceById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const device = await db.device.findUnique({
      where: { id: req.params.id },
      include: { deviceKeys: true }
    });

    if (!device || device.userId !== req.user.id) {
      return res.status(404).json({ error: { message: 'Device not found' } });
    }

    res.json({ device });
  } catch (err) {
    next(err);
  }
};

export const updateDevice = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = updateDeviceSchema.parse(req.body);
    
    const device = await db.device.findUnique({ where: { id: req.params.id } });
    if (!device || device.userId !== req.user.id) {
      return res.status(404).json({ error: { message: 'Device not found' } });
    }

    const updatedDevice = await db.device.update({
      where: { id: req.params.id },
      data: {
        ...(data.deviceName && { deviceName: data.deviceName }),
        ...(data.status && { status: data.status }),
      }
    });

    res.json({ device: updatedDevice });
  } catch (err) {
    next(err);
  }
};

export const revokeDevice = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const device = await db.device.findUnique({ where: { id: req.params.id } });
    if (!device || device.userId !== req.user.id) {
      return res.status(404).json({ error: { message: 'Device not found' } });
    }

    if (device.status === 'REVOKED') {
      return res.status(400).json({ error: { message: 'Device is already revoked' } });
    }

    const revokedDevice = await db.device.update({
      where: { id: req.params.id },
      data: {
        status: 'REVOKED',
        revokedAt: new Date()
      }
    });

    await db.session.deleteMany({
      where: { deviceId: req.params.id, userId: req.user.id }
    });

    res.json({ device: revokedDevice, success: true });
  } catch (err) {
    next(err);
  }
};

export const deleteDevice = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const device = await db.device.findUnique({ where: { id: req.params.id } });
    if (!device || device.userId !== req.user.id) {
      return res.status(404).json({ error: { message: 'Device not found' } });
    }

    // Must delete related DeviceKeys first due to foreign key constraints
    await db.deviceKey.deleteMany({ where: { deviceId: req.params.id } });
    await db.device.delete({ where: { id: req.params.id } });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
