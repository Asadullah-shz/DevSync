import { Request, Response, NextFunction } from 'express';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

interface AuthRequest extends Request {
  user?: any;
}

const STORAGE_ROOT = path.join(process.cwd(), 'storage', 'objects');

export const uploadObject = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: { message: 'No file uploaded' } });
    }

    // Calculate SHA-256 of the uploaded file
    const fileBuffer = await fs.readFile(file.path);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    const hash = hashSum.digest('hex');

    // Create CAS path: storage/objects/ab/ab82931...
    const prefix = hash.substring(0, 2);
    const destDir = path.join(STORAGE_ROOT, prefix);
    const destPath = path.join(destDir, hash);

    // Check if it already exists (Deduplication)
    try {
      await fs.access(destPath);
      // File already exists, clean up temp upload
      await fs.unlink(file.path);
    } catch {
      // File does not exist, move it to CAS
      await fs.mkdir(destDir, { recursive: true });
      await fs.rename(file.path, destPath);
    }

    res.status(201).json({ hash, size: file.size });
  } catch (err) {
    // Cleanup on error if temp file still exists
    if (req.file?.path) {
      fs.unlink(req.file.path).catch(() => {});
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
      await fs.access(filePath);
      res.sendFile(filePath);
    } catch {
      return res.status(404).json({ error: { message: 'Object not found' } });
    }
  } catch (err) {
    next(err);
  }
};
