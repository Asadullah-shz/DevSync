import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BackupService } from '../src/modules/backups/backup.service.js';
import fsPromises from 'fs/promises';
import path from 'path';
import AdmZip from 'adm-zip';

describe('Backup Verification Engine', () => {
  const tempDir = path.join(process.cwd(), 'temp_backup_test');
  const validZipPath = path.join(tempDir, 'valid.zip');
  const invalidZipPath = path.join(tempDir, 'invalid.zip');
  const corruptZipPath = path.join(tempDir, 'corrupt.zip');

  beforeAll(async () => {
    await fsPromises.mkdir(tempDir, { recursive: true });

    // 1. Create a valid zip file containing database/ directory structure
    const validZip = new AdmZip();
    validZip.addFile('database/dump.json', Buffer.from(JSON.stringify({ value: 'db dump' })));
    validZip.addFile('objects/ab/abcdef', Buffer.from('object data'));
    validZip.writeZip(validZipPath);

    // 2. Create an invalid zip containing only objects and no database dump
    const invalidZip = new AdmZip();
    invalidZip.addFile('objects/ab/abcdef', Buffer.from('object data'));
    invalidZip.writeZip(invalidZipPath);

    // 3. Create a corrupt/broken zip file (plain text instead of zip structure)
    await fsPromises.writeFile(corruptZipPath, 'this is not a zip file content');
  });

  afterAll(async () => {
    // Cleanup temporary files
    await fsPromises.rm(tempDir, { recursive: true, force: true });
  });

  it('should successfully verify a healthy backup zip file', async () => {
    const isVerified = await BackupService.verifyBackup(validZipPath);
    expect(isVerified).toBe(true);
  });

  it('should reject a backup zip file that does not contain a database/ folder', async () => {
    const isVerified = await BackupService.verifyBackup(invalidZipPath);
    expect(isVerified).toBe(false);
  });

  it('should reject a corrupted non-zip file structure', async () => {
    const isVerified = await BackupService.verifyBackup(corruptZipPath);
    expect(isVerified).toBe(false);
  });
});
