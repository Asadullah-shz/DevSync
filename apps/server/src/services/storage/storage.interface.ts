export interface StorageBackend {
  /**
   * Initialize the backend (e.g. create buckets, directories)
   */
  init(): Promise<void>;

  /**
   * Upload an object to the storage backend from a temporary file
   * @param hash The content hash (and identifier) of the object
   * @param tempFilePath Path to the temporary file
   */
  upload(hash: string, tempFilePath: string): Promise<void>;

  /**
   * Delete an object from the storage backend
   * @param hash The content hash (and identifier) of the object
   */
  delete(hash: string): Promise<void>;

  /**
   * Check if an object exists in the storage backend
   * @param hash The content hash (and identifier) of the object
   */
  exists(hash: string): Promise<boolean>;

  /**
   * Get the file size of an object in the storage backend
   * @param hash The content hash (and identifier) of the object
   */
  getFileSize(hash: string): Promise<number>;

  /**
   * Get a read stream for the object
   * @param hash The content hash (and identifier) of the object
   * @param start Valid for Range requests (optional)
   * @param end Valid for Range requests (optional)
   */
  downloadStream(hash: string, start?: number, end?: number): Promise<NodeJS.ReadableStream>;

  /**
   * Returns stats for the storage backend
   */
  getStats(): Promise<{ usedBytes: number; totalFiles: number; storagePath?: string }>;

  /**
   * Scans the storage backend for corrupted files
   * Returns the number of files scanned and an array of corrupted hashes
   */
  verifyIntegrity(): Promise<{ scanned: number; corrupted: string[]; durationMs: number }>;
}
