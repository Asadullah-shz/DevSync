import crypto from 'crypto';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { pipeline } from 'stream/promises';
import { StorageBackend } from './storage/storage.interface.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // Recommended for GCM
const TAG_LENGTH = 16;  // GCM authentication tag

function getKey(): Buffer | null {
  const raw = process.env.STORAGE_ENCRYPTION_KEY;
  if (!raw) return null;

  if (/^[a-fA-F0-9]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  return crypto.createHash('sha256').update(raw).digest();
}

export function isEncryptionEnabled(): boolean {
  return getKey() !== null;
}

/**
 * Encrypts `srcPath` → `destPath` using AES-256-GCM.
 * Format: IV || Ciphertext || AuthTag
 */
export async function encryptFile(srcPath: string, destPath: string): Promise<void> {
  const key = getKey();
  if (!key) {
    await fsPromises.copyFile(srcPath, destPath);
    return;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv) as crypto.CipherGCM;

  const readStream = fs.createReadStream(srcPath);
  const writeStream = fs.createWriteStream(destPath);

  writeStream.write(iv);
  await pipeline(readStream, cipher, writeStream);
  const tag = cipher.getAuthTag();
  await fsPromises.appendFile(destPath, tag);
}

/**
 * Decrypts an object from a generic StorageBackend into a readable stream.
 */
export async function decryptBackendStream(
  backend: StorageBackend,
  hash: string
): Promise<{ stream: NodeJS.ReadableStream; plaintextSize: number }> {
  const key = getKey();
  const totalSize = await backend.getFileSize(hash);

  if (!key) {
    const stream = await backend.downloadStream(hash);
    return { stream, plaintextSize: totalSize };
  }

  const ciphertextWithTagLength = totalSize - IV_LENGTH;
  const plaintextSize = ciphertextWithTagLength - TAG_LENGTH;

  if (plaintextSize < 0) {
    throw new Error(`Encrypted object ${hash} is too small to be valid.`);
  }

  // Helper to read a specific range into a Buffer
  const readRangeBuffer = async (start: number, end: number): Promise<Buffer> => {
    const stream = await backend.downloadStream(hash, start, end);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  };

  // Read IV
  const ivBuffer = await readRangeBuffer(0, IV_LENGTH - 1);
  // Read Tag
  const tagBuffer = await readRangeBuffer(totalSize - TAG_LENGTH, totalSize - 1);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer) as crypto.DecipherGCM;
  decipher.setAuthTag(tagBuffer);

  // Stream ciphertext region only
  const ciphertextStream = await backend.downloadStream(hash, IV_LENGTH, totalSize - TAG_LENGTH - 1);
  return { stream: ciphertextStream.pipe(decipher), plaintextSize };
}

export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
