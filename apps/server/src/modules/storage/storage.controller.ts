import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

interface AuthRequest extends Request {
  user?: any;
}

const STORAGE_ROOT = path.join(process.cwd(), 'storage', 'objects');

async function hashFileStream(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export const uploadObject = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: { message: 'No file uploaded' } });
    }

    // Stream-hash the file — never load the full contents into RAM
    const hash = await hashFileStream(file.path);

    // Create CAS path: storage/objects/ab/ab82931...
    const prefix = hash.substring(0, 2);
    const destDir = path.join(STORAGE_ROOT, prefix);
    const destPath = path.join(destDir, hash);

    // Check if it already exists (Deduplication)
    try {
      await fsPromises.access(destPath);
      // File already exists, clean up temp upload
      await fsPromises.unlink(file.path);
    } catch {
      // File does not exist, move it to CAS
      await fsPromises.mkdir(destDir, { recursive: true });
      await fsPromises.rename(file.path, destPath);
    }

    res.status(201).json({ hash, size: file.size });
  } catch (err) {
    // Cleanup on error if temp file still exists
    if (req.file?.path) {
      fsPromises.unlink(req.file.path).catch(() => {});
    }
    next(err);
  }
};

export const downloadObject = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { hash } = req.params;
    
    // Validate hash format to prevent path traversal
    if (!/^[a-f0-9]{64}$/.test(hash)) {
      return res.status(400).json({ error: { message: 'Invalid hash format' } });
    }

    const prefix = hash.substring(0, 2);
    const filePath = path.join(STORAGE_ROOT, prefix, hash);

    try {
      await fsPromises.access(filePath);
      res.sendFile(filePath);
    } catch {
      return res.status(404).json({ error: { message: 'Object not found' } });
    }
  } catch (err) {
    next(err);
  }
};

export const uploadChunk = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const file = req.file;
    const { uploadId, chunkIndex } = req.body;

    if (!file) return res.status(400).json({ error: { message: 'No chunk file uploaded' } });
    if (!uploadId || chunkIndex === undefined) {
      await fsPromises.unlink(file.path).catch(() => {});
      return res.status(400).json({ error: { message: 'Missing uploadId or chunkIndex' } });
    }

    // Validate uploadId to prevent path traversal
    if (!/^[a-zA-Z0-9-]+$/.test(uploadId)) {
      await fsPromises.unlink(file.path).catch(() => {});
      return res.status(400).json({ error: { message: 'Invalid uploadId' } });
    }

    const chunkDir = path.join(process.cwd(), 'storage', 'temp', uploadId);
    await fsPromises.mkdir(chunkDir, { recursive: true });

    const destPath = path.join(chunkDir, String(chunkIndex));
    await fsPromises.rename(file.path, destPath);

    res.status(200).json({ success: true, uploadId, chunkIndex });
  } catch (err) {
    if (req.file?.path) fsPromises.unlink(req.file.path).catch(() => {});
    next(err);
  }
};

export const completeChunkUpload = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { uploadId, totalChunks } = req.body;

    if (!uploadId || !totalChunks) {
      return res.status(400).json({ error: { message: 'Missing uploadId or totalChunks' } });
    }

    // Validate uploadId to prevent path traversal
    if (!/^[a-zA-Z0-9-]+$/.test(uploadId)) {
      return res.status(400).json({ error: { message: 'Invalid uploadId' } });
    }

    const chunkDir = path.join(process.cwd(), 'storage', 'temp', uploadId);
    
    try {
      await fsPromises.access(chunkDir);
    } catch {
      return res.status(404).json({ error: { message: 'Upload session not found' } });
    }

    // Check if all chunks exist
    for (let i = 0; i < totalChunks; i++) {
      try {
        await fsPromises.access(path.join(chunkDir, String(i)));
      } catch {
        return res.status(400).json({ error: { message: `Missing chunk ${i}` } });
      }
    }

    // Merge chunks into a single temp file
    const mergedTempFile = path.join(process.cwd(), 'storage', 'temp', `${uploadId}.merged`);
    const writeStream = fs.createWriteStream(mergedTempFile);

    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(chunkDir, String(i));
      await new Promise<void>((resolve, reject) => {
        const readStream = fs.createReadStream(chunkPath);
        readStream.pipe(writeStream, { end: false });
        readStream.on('end', resolve);
        readStream.on('error', reject);
      });
    }
    writeStream.end();
    
    // Wait for the file to finish writing
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // Hash the merged file
    const hash = await hashFileStream(mergedTempFile);
    const stats = await fsPromises.stat(mergedTempFile);

    // Move to CAS
    const prefix = hash.substring(0, 2);
    const destDir = path.join(STORAGE_ROOT, prefix);
    const destPath = path.join(destDir, hash);

    try {
      await fsPromises.access(destPath);
      // Already exists, delete our merged file
      await fsPromises.unlink(mergedTempFile);
    } catch {
      // Move to dest
      await fsPromises.mkdir(destDir, { recursive: true });
      await fsPromises.rename(mergedTempFile, destPath);
    }

    // Cleanup temp directory
    await fsPromises.rm(chunkDir, { recursive: true, force: true });

    res.status(201).json({ hash, size: stats.size });
  } catch (err) {
    next(err);
  }
};
