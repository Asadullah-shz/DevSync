import fs from 'fs';
import path from 'path';

const STORAGE_ROOT = path.join(process.cwd(), 'storage', 'objects');

export interface DiskStats {
  usedBytes: number;
  totalFiles: number;
  storagePath: string;
}

async function getDirSize(dirPath: string): Promise<{ size: number; count: number }> {
  let size = 0;
  let count = 0;
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const sub = await getDirSize(entryPath);
        size += sub.size;
        count += sub.count;
      } else if (entry.isFile()) {
        const stat = await fs.promises.stat(entryPath);
        size += stat.size;
        count++;
      }
    }
  } catch {
    // Directory may not exist yet
  }
  return { size, count };
}

export async function getStorageStats(): Promise<DiskStats> {
  const { size, count } = await getDirSize(STORAGE_ROOT);
  return {
    usedBytes: size,
    totalFiles: count,
    storagePath: STORAGE_ROOT
  };
}
