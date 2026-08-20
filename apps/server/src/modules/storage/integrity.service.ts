import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const STORAGE_ROOT = path.join(process.cwd(), 'storage', 'objects');

export interface IntegrityResult {
  scanned: number;
  corrupted: string[];
  durationMs: number;
}

export const scanStorage = async (): Promise<IntegrityResult> => {
  const start = Date.now();
  let scanned = 0;
  const corrupted: string[] = [];

  try {
    const prefixes = await fs.readdir(STORAGE_ROOT);
    
    for (const prefix of prefixes) {
      const prefixPath = path.join(STORAGE_ROOT, prefix);
      const stat = await fs.stat(prefixPath);
      
      if (stat.isDirectory()) {
        const files = await fs.readdir(prefixPath);
        for (const file of files) {
          const filePath = path.join(prefixPath, file);
          const fileStat = await fs.stat(filePath);
          
          if (fileStat.isFile()) {
            scanned++;
            
            // Check if hash matches
            const fileBuffer = await fs.readFile(filePath);
            const hashSum = crypto.createHash('sha256');
            hashSum.update(fileBuffer);
            const actualHash = hashSum.digest('hex');
            
            if (actualHash !== file) {
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
};
