/**
 * Disk Space Guard Middleware (Phase 41 — Production Readiness)
 *
 * Rejects upload requests with HTTP 507 when the server's storage disk is
 * critically full, preventing the OS from running out of space entirely.
 *
 * Configuration (environment variables):
 *   DISK_WARN_PERCENT   — warn in logs when usage exceeds this (default 80)
 *   DISK_BLOCK_PERCENT  — reject uploads when usage exceeds this (default 90)
 */
import { Request, Response, NextFunction } from 'express';
import fsPromises from 'fs/promises';
import path from 'path';

const STORAGE_PATH = process.env.STORAGE_DIR || path.join(process.cwd(), 'storage');
const WARN_PERCENT = Number(process.env.DISK_WARN_PERCENT ?? 80);
const BLOCK_PERCENT = Number(process.env.DISK_BLOCK_PERCENT ?? 90);

let lastCheck = 0;
let cachedPercent = 0;

const CACHE_MS = 30_000;

async function getDiskUsagePercent(): Promise<number> {
  const now = Date.now();
  if (now - lastCheck < CACHE_MS) return cachedPercent;

  try {
    const stats = await fsPromises.statfs(STORAGE_PATH);
    const total = Number(stats.blocks) * stats.bsize;
    const available = Number(stats.bavail) * stats.bsize;
    cachedPercent = total > 0 ? ((total - available) / total) * 100 : 0;
    lastCheck = now;
  } catch {
    // If statfs fails (Windows dev), fall through — don't block uploads
    cachedPercent = 0;
    lastCheck = now;
  }

  return cachedPercent;
}

export const diskSpaceGuard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const usagePercent = await getDiskUsagePercent();

  if (usagePercent >= BLOCK_PERCENT) {
    console.error(
      `[DiskSpaceGuard] CRITICAL: Disk usage at ${usagePercent.toFixed(1)}% — rejecting upload. ` +
      `Free up space or increase storage.`
    );
    res.status(507).json({
      error: {
        message: `Server storage is critically full (${usagePercent.toFixed(1)}% used). Upload rejected.`,
        code: 'INSUFFICIENT_STORAGE',
        usagePercent: Number(usagePercent.toFixed(1)),
      },
    });
    return;
  }

  if (usagePercent >= WARN_PERCENT) {
    console.warn(`[DiskSpaceGuard] WARNING: Disk usage at ${usagePercent.toFixed(1)}%. Consider freeing space.`);
  }

  next();
};
