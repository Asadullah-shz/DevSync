import { db } from '../../database/db.js';
import crypto from 'crypto';

export class AuditService {
  /**
   * Logs an action to the audit log.
   */
  static async logAction(params: {
    userId: string;
    deviceId?: string;
    action: string;
    details: string;
    ipAddress?: string;
  }) {
    try {
      const id = `AUD-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      await db.auditLog.create({
        data: {
          id,
          userId: params.userId,
          deviceId: params.deviceId,
          action: params.action,
          details: params.details,
          ipAddress: params.ipAddress,
        },
      });
    } catch (error) {
      console.error('[AuditService] Failed to create audit log:', error);
    }
  }
}
