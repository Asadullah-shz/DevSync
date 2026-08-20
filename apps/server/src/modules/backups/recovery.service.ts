import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { db } from '../../database/db.js';

const execAsync = util.promisify(exec);
const BACKUPS_DIR = process.env.BACKUPS_DIR || path.join(process.cwd(), 'backups');
const MONGO_URL = process.env.DATABASE_URL || 'mongodb://localhost:27017/devsync';

export class RecoveryService {
  /**
   * Checks if the database is completely empty and attempts to auto-restore
   * from the latest backup zip if one exists.
   */
  public static async autoRecoverIfEmpty(): Promise<void> {
    try {
      console.log('[RecoveryService] Checking if database is empty...');
      const userCount = await db.user.count();
      
      if (userCount > 0) {
        console.log(`[RecoveryService] Database has ${userCount} users. No recovery needed.`);
        return;
      }

      console.log('[RecoveryService] Database is empty. Looking for backups...');
      if (!fs.existsSync(BACKUPS_DIR)) {
        console.log('[RecoveryService] Backups directory not found. Skipping auto-recovery.');
        return;
      }

      const files = fs.readdirSync(BACKUPS_DIR);
      const zipFiles = files.filter(f => f.endsWith('.zip')).sort((a, b) => {
        const statA = fs.statSync(path.join(BACKUPS_DIR, a));
        const statB = fs.statSync(path.join(BACKUPS_DIR, b));
        return statB.mtimeMs - statA.mtimeMs; // Descending
      });

      if (zipFiles.length === 0) {
        console.log('[RecoveryService] No backup zip files found. Skipping auto-recovery.');
        return;
      }

      const latestBackup = zipFiles[0];
      const backupPath = path.join(BACKUPS_DIR, latestBackup);
      
      console.log(`[RecoveryService] Found latest backup: ${latestBackup}. Starting automatic disaster recovery...`);
      await this.restoreBackup(backupPath);
      
    } catch (err) {
      console.error('[RecoveryService] Error during auto-recovery check:', err);
    }
  }

  private static async restoreBackup(zipPath: string): Promise<void> {
    const tempDir = path.join(process.cwd(), '.temp_restore');
    
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      fs.mkdirSync(tempDir, { recursive: true });

      console.log('[RecoveryService] Extracting backup...');
      // Extract zip depending on platform. Since this is likely Linux in Docker:
      await execAsync(`unzip -o "${zipPath}" -d "${tempDir}"`);

      // Restore MongoDB
      const dbDumpDir = path.join(tempDir, 'database', 'devsync'); // Assuming devsync is the db name
      if (fs.existsSync(dbDumpDir)) {
        console.log('[RecoveryService] Restoring MongoDB database...');
        // Replace mongodb://... format with tools compatible string or just pass uri
        await execAsync(`mongorestore --uri="${MONGO_URL}" --drop "${dbDumpDir}"`);
      } else {
        console.log('[RecoveryService] No database dump found in backup.');
      }

      // Restore Objects
      const objectsDir = path.join(tempDir, 'objects');
      const targetObjectsDir = path.join(process.cwd(), 'storage', 'objects');
      if (fs.existsSync(objectsDir)) {
        console.log('[RecoveryService] Restoring object storage...');
        if (!fs.existsSync(targetObjectsDir)) {
          fs.mkdirSync(targetObjectsDir, { recursive: true });
        }
        
        // Copy files
        const objects = fs.readdirSync(objectsDir);
        for (const obj of objects) {
          fs.copyFileSync(path.join(objectsDir, obj), path.join(targetObjectsDir, obj));
        }
      }

      console.log('[RecoveryService] Automatic disaster recovery completed successfully!');
    } catch (err) {
      console.error('[RecoveryService] Failed to restore backup:', err);
      throw err;
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  }
}
