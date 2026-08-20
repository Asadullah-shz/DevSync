import fsPromises from 'fs/promises';
import os from 'os';
import { db } from '../../database/db.js';
import { Request, Response, NextFunction } from 'express';

export const getLiveness = (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
};

export const getReadiness = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db.user.findFirst({ select: { id: true } });
    res.status(200).json({ status: 'READY', database: 'CONNECTED', timestamp: new Date() });
  } catch (err) {
    res.status(503).json({ status: 'DOWN', database: 'DISCONNECTED', error: String(err) });
  }
};

export const getMetrics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Disk stats
    const storagePath = process.env.STORAGE_DIR || './';
    let diskStats = { total: 0, free: 0, available: 0, usagePercent: 0 };
    try {
      const stats = await fsPromises.statfs(storagePath);
      const total = Number(stats.blocks) * stats.bsize;
      const available = Number(stats.bavail) * stats.bsize;
      const free = Number(stats.bfree) * stats.bsize;
      diskStats = {
        total,
        free,
        available,
        usagePercent: total > 0 ? Number(((total - available) / total * 100).toFixed(2)) : 0
      };
    } catch (err) {
      console.warn('[HealthController] Failed to read statfs storage path:', err);
    }

    // 2. OS stats
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memory = {
      total: totalMem,
      free: freeMem,
      usagePercent: Number(((totalMem - freeMem) / totalMem * 100).toFixed(2))
    };
    const cpu = {
      loadAvg: os.loadavg(),
      uptime: os.uptime(),
      cores: os.cpus().length
    };

    // 3. Database Stats — run all in parallel for speed
    const [
      totalUsers,
      activeDevices,
      totalDevices,
      unresolvedConflicts,
      completedBackups,
      failedBackups,
      totalProjects,
      totalFiles,
      totalVersions,
      activeSyncs,
      recentAuditLogs,
    ] = await Promise.all([
      db.user.count(),
      db.device.count({ where: { status: 'ACTIVE' } }),
      db.device.count(),
      db.conflict.count({ where: { status: 'UNRESOLVED' } }),
      db.backupJob.count({ where: { status: 'COMPLETED' } }),
      db.backupJob.count({ where: { status: 'FAILED' } }),
      db.project.count(),
      db.file.count(),
      db.fileVersion.count(),
      db.syncOperation.count({ where: { status: 'PENDING' } }),
      db.auditLog.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { email: true, name: true } },
        },
      }),
    ]);

    res.status(200).json({
      timestamp: new Date(),
      system: {
        memory,
        cpu,
        disk: diskStats,
      },
      devsync: {
        users: totalUsers,
        activeDevices,
        totalDevices,
        unresolvedConflicts,
        completedBackups,
        failedBackups,
        totalProjects,
        totalFiles,
        totalVersions,
        activeSyncs,
      },
      diskAlert: {
        warnPercent: Number(process.env.DISK_WARN_PERCENT ?? 80),
        blockPercent: Number(process.env.DISK_BLOCK_PERCENT ?? 90),
        currentPercent: diskStats.usagePercent,
        status: diskStats.usagePercent >= Number(process.env.DISK_BLOCK_PERCENT ?? 90)
          ? 'CRITICAL'
          : diskStats.usagePercent >= Number(process.env.DISK_WARN_PERCENT ?? 80)
          ? 'WARNING'
          : 'OK',
      },
      recentAuditLogs: recentAuditLogs.map(log => ({
        id: log.id,
        action: log.action,
        userEmail: (log as any).user?.email || 'System',
        userName: (log as any).user?.name || null,
        createdAt: log.createdAt,
        details: log.details,
      })),
    });
  } catch (err) {
    next(err);
  }
};
