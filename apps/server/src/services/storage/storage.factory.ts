import { StorageBackend } from './storage.interface.js';
import { LocalStorageBackend } from './local-storage.backend.js';
import { S3StorageBackend } from './s3-storage.backend.js';

let backendInstance: StorageBackend | null = null;

export const storageFactory = {
  getBackend: (): StorageBackend => {
    if (backendInstance) {
      return backendInstance;
    }

    const backendType = process.env.STORAGE_BACKEND || 'local';

    if (backendType === 's3') {
      backendInstance = new S3StorageBackend();
    } else {
      backendInstance = new LocalStorageBackend();
    }

    // Initialize asynchronously in the background
    backendInstance.init().catch(err => {
      console.error('[StorageFactory] Failed to initialize storage backend:', err);
    });

    return backendInstance;
  }
};
