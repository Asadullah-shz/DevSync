import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { encryptFile, decryptBackendStream, isEncryptionEnabled } from '../../services/encryption.service.js';
import { storageFactory } from '../../services/storage/storage.factory.js';

interface AuthRequest extends Request {
  user?: any;
}

const TEMP_STORAGE = path.join(process.cwd(), 'storage', 'temp');

async function hashFileStream(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => {
      stream.destroy();
      resolve(hash.digest('hex'));
    });
    stream.on('error', (err) => {
      stream.destroy();
      reject(err);
    });
  });
}

async function moveFile(src: string, dest: string) {
  try {
    await fsPromises.rename(src, dest);
  } catch (err: any) {
    if (err.code === 'EXDEV') {
      await fsPromises.copyFile(src, dest);
      await fsPromises.unlink(src);
    } else {
      throw err;
    }
  }
}

export const uploadObject = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: { message: 'No file uploaded' } });
    }

    const backend = storageFactory.getBackend();
    const hash = await hashFileStream(file.path);

    if (await backend.exists(hash)) {
      await fsPromises.unlink(file.path).catch(() => {});
      return res.status(201).json({ hash, size: file.size, encrypted: isEncryptionEnabled() });
    }

    const tempEncryptedPath = path.join(TEMP_STORAGE, `${hash}.enc`);
    await fsPromises.mkdir(TEMP_STORAGE, { recursive: true });

    await encryptFile(file.path, tempEncryptedPath);
    await backend.upload(hash, tempEncryptedPath);

    await fsPromises.unlink(file.path).catch(() => {});
    await fsPromises.unlink(tempEncryptedPath).catch(() => {});

    res.status(201).json({ hash, size: file.size, encrypted: isEncryptionEnabled() });
  } catch (err) {
    if (req.file?.path) {
      fsPromises.unlink(req.file.path).catch(() => {});
    }
    next(err);
  }
};

export const downloadObject = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { hash } = req.params;

    if (!/^[a-f0-9]{64}$/.test(hash)) {
      return res.status(400).json({ error: { message: 'Invalid hash format' } });
    }

    const backend = storageFactory.getBackend();
    if (!(await backend.exists(hash))) {
      return res.status(404).json({ error: { message: 'Object not found' } });
    }

    const { stream, plaintextSize } = await decryptBackendStream(backend, hash);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', plaintextSize);

    stream.pipe(res);
    stream.on('error', (err: Error) => {
      if (!res.headersSent) {
        next(err);
      } else {
        res.destroy(err);
      }
    });
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

    if (!/^[a-zA-Z0-9-]+$/.test(uploadId)) {
      await fsPromises.unlink(file.path).catch(() => {});
      return res.status(400).json({ error: { message: 'Invalid uploadId' } });
    }

    const chunkDir = path.join(TEMP_STORAGE, uploadId);
    await fsPromises.mkdir(chunkDir, { recursive: true });

    const destPath = path.join(chunkDir, String(chunkIndex));
    await moveFile(file.path, destPath);

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

    if (!/^[a-zA-Z0-9-]+$/.test(uploadId)) {
      return res.status(400).json({ error: { message: 'Invalid uploadId' } });
    }

    const chunkDir = path.join(TEMP_STORAGE, uploadId);

    try {
      await fsPromises.access(chunkDir);
    } catch {
      return res.status(404).json({ error: { message: 'Upload session not found' } });
    }

    for (let i = 0; i < totalChunks; i++) {
      try {
        await fsPromises.access(path.join(chunkDir, String(i)));
      } catch {
        return res.status(400).json({ error: { message: `Missing chunk ${i}` } });
      }
    }

    const mergedTempFile = path.join(TEMP_STORAGE, `${uploadId}.merged`);
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

    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    const hash = await hashFileStream(mergedTempFile);
    const stats = await fsPromises.stat(mergedTempFile);
    const backend = storageFactory.getBackend();

    if (await backend.exists(hash)) {
      await fsPromises.unlink(mergedTempFile).catch(() => {});
    } else {
      const tempEncryptedPath = path.join(TEMP_STORAGE, `${hash}.enc`);
      await encryptFile(mergedTempFile, tempEncryptedPath);
      await backend.upload(hash, tempEncryptedPath);
      await fsPromises.unlink(mergedTempFile).catch(() => {});
      await fsPromises.unlink(tempEncryptedPath).catch(() => {});
    }

    await fsPromises.rm(chunkDir, { recursive: true, force: true });

    res.status(201).json({ hash, size: stats.size, encrypted: isEncryptionEnabled() });
  } catch (err) {
    next(err);
  }
};
