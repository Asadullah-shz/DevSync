import { storageFactory } from '../../services/storage/storage.factory.js';

export interface DiskStats {
  usedBytes: number;
  totalFiles: number;
  storagePath?: string;
}

export async function getStorageStats(): Promise<DiskStats> {
  const backend = storageFactory.getBackend();
  const stats = await backend.getStats();
  
  return {
    usedBytes: stats.usedBytes,
    totalFiles: stats.totalFiles,
    storagePath: stats.storagePath
  };
}
