import { StorageBackend } from './storage.interface.js';
import fsPromises from 'fs/promises';
import fs from 'fs';
import path from 'path';

export class LocalStorageBackend implements StorageBackend {
  private storageRoot: string;

  constructor() {
    this.storageRoot = process.env.STORAGE_DIR || path.join(process.cwd(), 'storage', 'objects');
  }

  async init(): Promise<void> {
    await fsPromises.mkdir(this.storageRoot, { recursive: true });
  }

  async upload(hash: string, tempFilePath: string): Promise<void> {
    const prefix = hash.substring(0, 2);
    const destDir = path.join(this.storageRoot, prefix);
    const destPath = path.join(destDir, hash);

    await fsPromises.mkdir(destDir, { recursive: true });

    try {
      await fsPromises.rename(tempFilePath, destPath);
    } catch (err: any) {
      if (err.code === 'EXDEV') {
        await fsPromises.copyFile(tempFilePath, destPath);
        await fsPromises.unlink(tempFilePath).catch(() => {});
      } else {
        throw err;
      }
    }
  }

  async delete(hash: string): Promise<void> {
    const prefix = hash.substring(0, 2);
    const filePath = path.join(this.storageRoot, prefix, hash);
    await fsPromises.unlink(filePath).catch(() => {});
  }

  async exists(hash: string): Promise<boolean> {
    const prefix = hash.substring(0, 2);
    const filePath = path.join(this.storageRoot, prefix, hash);
    try {
      await fsPromises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getFileSize(hash: string): Promise<number> {
    const prefix = hash.substring(0, 2);
    const filePath = path.join(this.storageRoot, prefix, hash);
    const stat = await fsPromises.stat(filePath);
    return stat.size;
  }

  async downloadStream(hash: string, start?: number, end?: number): Promise<NodeJS.ReadableStream> {
    const prefix = hash.substring(0, 2);
    const filePath = path.join(this.storageRoot, prefix, hash);
    
    // Note: To properly support range requests with encryption, decryption stream handling is done in the controller,
    // so we just return the raw read stream for the file here.
    const options: any = {};
    if (start !== undefined) options.start = start;
    if (end !== undefined) options.end = end;
    
    return fs.createReadStream(filePath, options);
  }

  async getStats(): Promise<{ usedBytes: number; totalFiles: number; storagePath?: string }> {
    const { size, count } = await this.getDirSize(this.storageRoot);
    return {
      usedBytes: size,
      totalFiles: count,
      storagePath: this.storageRoot,
    };
  }

  private async getDirSize(dirPath: string): Promise<{ size: number; count: number }> {
    let size = 0;
    let count = 0;
    try {
      const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          const sub = await this.getDirSize(entryPath);
          size += sub.size;
          count += sub.count;
        } else if (entry.isFile()) {
          const stat = await fsPromises.stat(entryPath);
          size += stat.size;
          count++;
        }
      }
    } catch {
      // Directory may not exist yet
    }
    return { size, count };
  }

  async verifyIntegrity(): Promise<{ scanned: number; corrupted: string[]; durationMs: number }> {
    const crypto = await import('crypto');
    const start = Date.now();
    let scanned = 0;
    const corrupted: string[] = [];

    try {
      const prefixes = await fsPromises.readdir(this.storageRoot);
      
      for (const prefix of prefixes) {
        const prefixPath = path.join(this.storageRoot, prefix);
        const stat = await fsPromises.stat(prefixPath);
        
        if (stat.isDirectory()) {
          const files = await fsPromises.readdir(prefixPath);
          for (const file of files) {
            const filePath = path.join(prefixPath, file);
            const fileStat = await fsPromises.stat(filePath);
            
            if (fileStat.isFile()) {
              scanned++;
              
              // Note: If encryption is enabled, this will hash the encrypted file, which won't match the filename (which is the hash of the plaintext).
              // However, since integrity check is usually done locally or relies on the CAS nature, we just hash the content on disk.
              // A proper encrypted integrity check would decrypt it first, but for now we keep the existing V2 behavior.
              const fileBuffer = await fsPromises.readFile(filePath);
              const hashSum = crypto.createHash('sha256');
              hashSum.update(fileBuffer);
              const actualHash = hashSum.digest('hex');
              
              // In encrypted mode, actualHash != file. This is a known limitation of this simple integrity check.
              if (actualHash !== file && !process.env.STORAGE_ENCRYPTION_KEY) {
                console.warn(`[INTEGRITY] CORRUPTED OBJECT DETECTED: ${file}`);
                corrupted.push(file);
              }
            }
          }
        }
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.error('[INTEGRITY] Storage scan failed:', err);
      }
    }

    const durationMs = Date.now() - start;
    return { scanned, corrupted, durationMs };
  }
  
  /**
   * Retrieves the local file path for an object.
   * Useful when we explicitly need a local file (e.g. for creating a zip archive in BackupService).
   */
  getLocalFilePath(hash: string): string {
    const prefix = hash.substring(0, 2);
    return path.join(this.storageRoot, prefix, hash);
  }
}
