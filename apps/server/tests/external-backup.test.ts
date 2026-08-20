import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BackupService } from '../src/modules/backups/backup.service.js';
import fsPromises from 'fs/promises';
import path from 'path';

describe('External Backup Engine', () => {
  const tempDir = path.join(process.cwd(), 'temp_ext_backup_test');
  const mockLocalZipDir = path.join(tempDir, 'local');
  const externalDir = path.join(tempDir, 'external');
  
  beforeAll(async () => {
    await fsPromises.mkdir(mockLocalZipDir, { recursive: true });
    await fsPromises.mkdir(externalDir, { recursive: true });
  });

  afterAll(async () => {
    // Cleanup temporary directories
    await fsPromises.rm(tempDir, { recursive: true, force: true });
  });

  it('should copy a backup zip to the external path', async () => {
    const jobId = `job_test_ext_1`;
    const localZipPath = path.join(mockLocalZipDir, `${jobId}.zip`);
    const expectedExtPath = path.join(externalDir, `${jobId}.zip`);

    // Create a mock zip file
    await fsPromises.writeFile(localZipPath, 'mock-zip-content');

    // Execute copy
    await BackupService.copyToExternal(jobId, localZipPath, externalDir);

    // Verify copy exists
    await expect(fsPromises.access(expectedExtPath)).resolves.toBeUndefined();
    
    const content = await fsPromises.readFile(expectedExtPath, 'utf-8');
    expect(content).toBe('mock-zip-content');
  });

  it('should enforce the 7-file retention policy on the external directory', async () => {
    // Pre-populate 10 mock zip files in the external directory
    for (let i = 0; i < 10; i++) {
      const p = path.join(externalDir, `old_job_${i}.zip`);
      await fsPromises.writeFile(p, `mock-zip-${i}`);
      // Artificially space out mtimes so sorting is predictable
      const date = new Date();
      date.setSeconds(date.getSeconds() - (20 - i)); 
      await fsPromises.utimes(p, date, date);
    }

    const newJobId = `job_test_ext_retention`;
    const localZipPath = path.join(mockLocalZipDir, `${newJobId}.zip`);
    await fsPromises.writeFile(localZipPath, 'new-mock-zip');

    // Execute copy (should trigger retention and leave exactly 7 files)
    await BackupService.copyToExternal(newJobId, localZipPath, externalDir);

    const files = await fsPromises.readdir(externalDir);
    const zips = files.filter((f) => f.endsWith('.zip'));

    // Should retain 7 zip files maximum
    expect(zips.length).toBe(7);
    
    // The new job must be among the retained files
    expect(zips).toContain(`${newJobId}.zip`);
    // And the oldest files should be deleted (e.g. old_job_0, 1, 2)
    expect(zips).not.toContain(`old_job_0.zip`);
  });
});
