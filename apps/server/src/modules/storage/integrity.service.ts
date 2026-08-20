import { storageFactory } from '../../services/storage/storage.factory.js';

export interface IntegrityResult {
  scanned: number;
  corrupted: string[];
  durationMs: number;
}

export const scanStorage = async (): Promise<IntegrityResult> => {
  const backend = storageFactory.getBackend();
  return await backend.verifyIntegrity();
};
