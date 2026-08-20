import { db } from '../../database/db.js';
import { exec } from 'child_process';
import AdmZip from 'adm-zip';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { ZipArchive } from 'archiver';

const execAsync = promisify(exec);

export class BackupService {
  static async runBackup(jobId: string) {
    const backupDir = path.join(process.cwd(), 'backups');
    const dumpDir = path.join(backupDir, `dump_${jobId}`);
    const zipPath = path.join(backupDir, `${jobId}.zip`);

    try {
      // Ensure backup dir exists
      await fsPromises.mkdir(backupDir, { recursive: true });

      // 1. Run mongodump
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) {
        throw new Error('DATABASE_URL is not defined');
      }

      console.log(`[BackupService] Starting mongodump for job ${jobId}...`);
      try {
        await execAsync(`mongodump --uri="${dbUrl}" --out="${dumpDir}"`);
      } catch (err: any) {
        const isMissing = err.message?.includes('not recognized') || err.message?.includes('not found') || err.code === 127;
        if (isMissing) {
          console.warn('[BackupService] mongodump is not installed. Skipping database dump. Install MongoDB Database Tools to enable full backups.');
      
          await db.backupJob.update({
            where: { id: jobId },
            data: { status: 'FAILED', completedAt: new Date(), metadata: 'SKIPPED: mongodump not installed' } as any,
          }).catch(() => {});
          return;
        }
        console.error('[BackupService] mongodump failed:', err.message);
        throw new Error('Database dump failed: ' + err.message);
      }

      console.log(`[BackupService] Creating zip archive for job ${jobId}...`);
      const output = fs.createWriteStream(zipPath);
      const archive = new ZipArchive({ zlib: { level: 9 } });

      const zipPromise = new Promise<void>((resolve, reject) => {
        output.on('close', () => resolve());
        archive.on('error', reject);
      });

      archive.pipe(output);

      // Append database dump
      archive.directory(dumpDir, 'database');

      // Append object storage
      const { storageFactory } = await import('../../services/storage/storage.factory.js');
      const backend = storageFactory.getBackend();
      
      if (backend.constructor.name === 'LocalStorageBackend') {
        const localBackend = backend as any;
        // Access storageRoot property which is specific to LocalStorageBackend
        const objectsDir = localBackend.storageRoot;
        try {
          await fsPromises.access(objectsDir);
          archive.directory(objectsDir, 'objects');
        } catch {
          console.warn('[BackupService] Object storage directory not found, skipping objects.');
        }
      } else {
        console.log('[BackupService] Storage backend is not local (e.g. S3). Skipping object storage from local backup zip as it is managed remotely.');
      }

      await archive.finalize();
      await zipPromise;

      // Verify backup integrity
      console.log(`[BackupService] Verifying backup integrity for job ${jobId}...`);
      const isVerified = await this.verifyBackup(zipPath);
      if (!isVerified) {
        throw new Error('Backup integrity verification failed (corrupt or incomplete archive)');
      }

      // 3. Cleanup temp dump dir
      await fsPromises.rm(dumpDir, { recursive: true, force: true });

      // 4. Calculate size and update job
      const stats = await fsPromises.stat(zipPath);
      await db.backupJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          size: stats.size,
          path: zipPath,
        },
      });

      console.log(`[BackupService] Backup ${jobId} completed successfully.`);

      // External Backup Copy
      const externalPath = process.env.EXTERNAL_BACKUP_PATH;
      if (externalPath) {
        try {
          await this.copyToExternal(jobId, zipPath, externalPath);
        } catch (extErr) {
          console.error(`[BackupService] External backup copy failed. Local backup intact.`, extErr);
        }
      }

      // 5. Apply Retention Policy (keep last 7)
      await this.applyRetentionPolicy(backupDir, 7);

    } catch (error: any) {
      console.error(`[BackupService] Backup job ${jobId} failed:`, error);
      
      // Cleanup partially created zip or dump
      await fsPromises.rm(dumpDir, { recursive: true, force: true }).catch(() => {});
      await fsPromises.rm(zipPath, { force: true }).catch(() => {});

      await db.backupJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
        },
      });
    }
  }

  private static async applyRetentionPolicy(backupDir: string, keepCount: number) {
    try {
      const files = await fsPromises.readdir(backupDir);
      const zipFiles = files.filter(f => f.endsWith('.zip'));

      if (zipFiles.length <= keepCount) {
        return;
      }

      // Sort by creation time descending (newest first)
      const fileStats = await Promise.all(
        zipFiles.map(async (file) => {
          const filePath = path.join(backupDir, file);
          const stats = await fsPromises.stat(filePath);
          return { file: filePath, time: stats.mtime.getTime() };
        })
      );

      fileStats.sort((a, b) => b.time - a.time);

      // Delete files beyond keepCount
      const toDelete = fileStats.slice(keepCount);
      for (const item of toDelete) {
        console.log(`[BackupService] Deleting old backup: ${item.file}`);
        await fsPromises.unlink(item.file);
      }
    } catch (err) {
      console.error('[BackupService] Failed to apply retention policy:', err);
    }
  }

  static async copyToExternal(jobId: string, zipPath: string, externalPath: string) {
    await fsPromises.mkdir(externalPath, { recursive: true });
    const extZipPath = path.join(externalPath, `${jobId}.zip`);
    console.log(`[BackupService] Copying backup to external destination: ${extZipPath}`);
    await fsPromises.copyFile(zipPath, extZipPath);
    // Apply retention policy to external location as well
    await this.applyRetentionPolicy(externalPath, 7);
  }

  static async verifyBackup(zipPath: string): Promise<boolean> {
    try {
      const zip = new AdmZip(zipPath);
      const entries = zip.getEntries();
      
      // Check for expected database/ directory
      const hasDatabase = entries.some(e => e.entryName.startsWith('database/'));
      if (!hasDatabase) {
        console.error(`[BackupVerification] Failed: Missing 'database' directory in archive ${zipPath}`);
        return false;
      }

      // Attempt decompressing the first entry to confirm readability
      if (entries.length > 0) {
        const firstEntry = entries[0];
        zip.readFile(firstEntry);
      }

      return true;
    } catch (err) {
      console.error(`[BackupVerification] Failed to parse zip archive ${zipPath}:`, err);
      return false;
    }
  }
}
