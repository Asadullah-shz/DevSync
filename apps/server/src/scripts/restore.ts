import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fsPromises from 'fs/promises';
import fs from 'fs';
import AdmZip from 'adm-zip';
import dotenv from 'dotenv';

// Load environment variables if run independently
dotenv.config();

const execAsync = promisify(exec);

async function runRestore() {
  const args = process.argv.slice(2);
  const zipPath = args[0];

  if (!zipPath) {
    console.error('Usage: npm run restore -- <path/to/backup.zip>');
    process.exit(1);
  }

  const absoluteZipPath = path.resolve(zipPath);
  
  try {
    await fsPromises.access(absoluteZipPath);
  } catch {
    console.error(`File not found: ${absoluteZipPath}`);
    process.exit(1);
  }

  const tempDir = path.join(process.cwd(), 'temp_restore_' + Date.now());

  try {
    console.log(`[Restore] Extracting ${absoluteZipPath} to ${tempDir}...`);
    const zip = new AdmZip(absoluteZipPath);
    
    // We run it synchronously because AdmZip's async extract is callback-based and sometimes flaky.
    // Since this is a CLI script, sync is fine.
    zip.extractAllTo(tempDir, true);

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('DATABASE_URL is not defined in environment');
    }

    const dumpDir = path.join(tempDir, 'database');
    const objectsDir = path.join(tempDir, 'objects');

    // 1. Restore Database
    try {
      await fsPromises.access(dumpDir);
      console.log(`[Restore] Restoring database from ${dumpDir}...`);
      // Warning: --drop will drop collections before restoring
      await execAsync(`mongorestore --uri="${dbUrl}" --drop --dir="${dumpDir}"`);
      console.log(`[Restore] Database restored successfully.`);
    } catch (err: any) {
      console.warn(`[Restore] Could not restore database (maybe 'database' folder is missing or mongorestore failed). Error: ${err.message}`);
    }

    // 2. Restore Object Storage
    try {
      await fsPromises.access(objectsDir);
      console.log(`[Restore] Restoring object storage from ${objectsDir}...`);
      const targetObjectsDir = path.join(process.cwd(), 'storage', 'objects');
      
      // Ensure target directory exists
      await fsPromises.mkdir(targetObjectsDir, { recursive: true });

      // Copy objects recursively
      await fsPromises.cp(objectsDir, targetObjectsDir, { recursive: true, force: true });
      console.log(`[Restore] Object storage restored successfully.`);
    } catch (err: any) {
      console.warn(`[Restore] Could not restore object storage (maybe 'objects' folder is missing). Error: ${err.message}`);
    }

  } catch (err) {
    console.error('[Restore] An error occurred during restore:', err);
  } finally {
    // Cleanup
    console.log(`[Restore] Cleaning up temporary directory ${tempDir}...`);
    await fsPromises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

runRestore().then(() => {
  console.log('[Restore] Done.');
}).catch(err => {
  console.error('[Restore] Unhandled error:', err);
  process.exit(1);
});
