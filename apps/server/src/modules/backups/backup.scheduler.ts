import { db } from '../../database/db.js';
import { BackupService } from './backup.service.js';

export class BackupScheduler {
  private static intervalId: NodeJS.Timeout | null = null;
  // Check every hour (3600000ms)
  private static CHECK_INTERVAL_MS = 3600000;

  static start() {
    if (this.intervalId) return;

    console.log('[BackupScheduler] Starting daily backup background scheduler...');
    
    // Run an initial check shortly after startup (after 30 seconds)
    setTimeout(() => this.checkAndTriggerBackup(), 30000);

    // Schedule periodic checks
    this.intervalId = setInterval(() => this.checkAndTriggerBackup(), this.CHECK_INTERVAL_MS);
  }

  static stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private static async checkAndTriggerBackup() {
    try {
      console.log('[BackupScheduler] Running scheduled backup check...');
      
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Check if there was any completed or in-progress backup job in the last 24 hours
      const recentJob = await db.backupJob.findFirst({
        where: {
          startedAt: { gte: twentyFourHoursAgo },
          status: { in: ['COMPLETED', 'IN_PROGRESS'] }
        }
      });

      if (recentJob) {
        console.log(`[BackupScheduler] Recent backup job found (ID: ${recentJob.id}, status: ${recentJob.status}). Skipping scheduled trigger.`);
        return;
      }

      console.log('[BackupScheduler] No recent backup found. Triggering automated daily backup...');
      
      const backupJob = await db.backupJob.create({
        data: {
          id: `BCK-AUTO-${Date.now()}`,
          status: 'IN_PROGRESS'
        }
      });

      // Run asynchronously
      BackupService.runBackup(backupJob.id);
    } catch (err) {
      console.error('[BackupScheduler] Error checking/triggering backup:', err);
    }
  }
}
