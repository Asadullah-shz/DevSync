import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, server } from '../src/app.js';
import fsPromises from 'fs/promises';
import path from 'path';

describe('Storage & Chunked Upload API', () => {
  let accessToken: string;
  const tempFiles: string[] = [];

  beforeAll(async () => {
    // 1. Setup mock user credentials
    const email = `storage_test_${Date.now()}@example.com`;
    await request(app).post('/api/v1/auth/register').send({ email, password: 'password', name: 'User' });
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password: 'password' });
    accessToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    // Cleanup CAS storage entries generated during test runs
    for (const file of tempFiles) {
      await fsPromises.rm(file, { force: true }).catch(() => {});
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('should successfully upload and download a single file', async () => {
    const fileContent = 'Single upload test file content';
    const tempUploadPath = path.join(process.cwd(), 'temp_single_upload.txt');
    await fsPromises.writeFile(tempUploadPath, fileContent);

    // Upload
    const res = await request(app)
      .post('/api/v1/storage/upload')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', tempUploadPath);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('hash');
    expect(res.body).toHaveProperty('size');
    expect(res.body.size).toBe(fileContent.length);

    const hash = res.body.hash;
    const prefix = hash.substring(0, 2);
    tempFiles.push(path.join(process.cwd(), 'storage', 'objects', prefix, hash));

    // Clean up temp file
    await fsPromises.unlink(tempUploadPath);

    // Download
    const downloadRes = await request(app)
      .get(`/api/v1/storage/download/${hash}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(downloadRes.status).toBe(200);
    expect(downloadRes.body.toString()).toBe(fileContent);
  });

  it('should successfully upload a file in chunks and merge them correctly', async () => {
    const uploadId = `upload-id-${Date.now()}`;
    const chunks = [
      'Chunk number one, ',
      'followed by chunk number two, ',
      'and finally chunk number three.'
    ];
    const fullContent = chunks.join('');

    // Upload chunks sequentially
    for (let i = 0; i < chunks.length; i++) {
      const chunkPath = path.join(process.cwd(), `temp_chunk_${i}.txt`);
      await fsPromises.writeFile(chunkPath, chunks[i]);

      const res = await request(app)
        .post('/api/v1/storage/upload/chunk')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('uploadId', uploadId)
        .field('chunkIndex', i)
        .attach('chunk', chunkPath);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Clean up temp chunk
      await fsPromises.unlink(chunkPath);
    }

    // Complete chunk upload
    const completeRes = await request(app)
      .post('/api/v1/storage/upload/complete')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        uploadId,
        totalChunks: chunks.length
      });

    expect(completeRes.status).toBe(201);
    expect(completeRes.body).toHaveProperty('hash');
    expect(completeRes.body.size).toBe(fullContent.length);

    const hash = completeRes.body.hash;
    const prefix = hash.substring(0, 2);
    tempFiles.push(path.join(process.cwd(), 'storage', 'objects', prefix, hash));

    // Download merged file to verify integrity
    const downloadRes = await request(app)
      .get(`/api/v1/storage/download/${hash}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(downloadRes.status).toBe(200);
    expect(downloadRes.body.toString()).toBe(fullContent);
  });
});
