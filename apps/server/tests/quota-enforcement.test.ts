import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, server } from '../src/app.js';
import { db } from '../src/database/db.js';

describe('Project Storage Quota Enforcement', () => {
  let accessToken: string;
  let deviceId: string;
  let workspaceId: string;
  let projectId: string;
  const originalQuota = process.env.STORAGE_QUOTA_MB;

  beforeAll(async () => {
    // 1. Setup mock credentials and workspace entities
    const email = `quota_test_${Date.now()}@example.com`;
    await request(app).post('/api/v1/auth/register').send({ email, password: 'password', name: 'User' });
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password: 'password' });
    accessToken = loginRes.body.accessToken;

    const deviceRes = await request(app).post('/api/v1/devices/register')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ deviceName: 'DevA', hostname: 'hostA', platform: 'win', platformVersion: '1', appVersion: '1', publicKey: 'key' });
    deviceId = deviceRes.body.device.id;

    const wsRes = await request(app).post('/api/v1/workspaces').set('Authorization', `Bearer ${accessToken}`).send({ name: 'WS' });
    workspaceId = wsRes.body.workspace.id;

    const projRes = await request(app).post('/api/v1/projects').set('Authorization', `Bearer ${accessToken}`).send({ name: 'Proj', workspaceId });
    projectId = projRes.body.project.id;

    // Set a very tiny storage quota of 100 bytes (0.000095 MB) for precise testing
    process.env.STORAGE_QUOTA_MB = '0.000095';
  });

  afterAll(async () => {
    // Restore original quota environment variable
    if (originalQuota !== undefined) {
      process.env.STORAGE_QUOTA_MB = originalQuota;
    } else {
      delete process.env.STORAGE_QUOTA_MB;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('should allow file syncs when well under the project quota limit', async () => {
    const res = await request(app)
      .post(`/api/v1/sync/${projectId}/operations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        deviceId,
        operations: [
          {
            type: 'CREATE',
            path: 'file1.txt',
            hash: 'hash-f1',
            size: 40,
            timestamp: new Date().toISOString()
          }
        ]
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const file = await db.file.findFirst({ where: { projectId, path: 'file1.txt' } });
    expect(file).toBeDefined();
    expect(file?.size).toBe(40);
  });

  it('should block file syncs and return 413 when pushing project storage over quota limit', async () => {
    const res = await request(app)
      .post(`/api/v1/sync/${projectId}/operations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        deviceId,
        operations: [
          {
            type: 'CREATE',
            path: 'file2.txt',
            hash: 'hash-f2',
            size: 70, // 40 + 70 = 110 bytes > 100 bytes limit
            timestamp: new Date().toISOString()
          }
        ]
      });

    expect(res.status).toBe(413);
    expect(res.body.error.message).toContain('Storage quota exceeded');

    // Confirm file2.txt was not created
    const file = await db.file.findFirst({ where: { projectId, path: 'file2.txt' } });
    expect(file).toBeNull();
  });

  it('should permit modification updates that reduce file sizes or maintain quota limit compatibility', async () => {
    // Reduce file1.txt from 40 bytes to 10 bytes
    const res = await request(app)
      .post(`/api/v1/sync/${projectId}/operations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        deviceId,
        operations: [
          {
            type: 'MODIFY',
            path: 'file1.txt',
            hash: 'hash-f1-updated',
            size: 10, // 10 bytes
            timestamp: new Date().toISOString()
          }
        ]
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const file = await db.file.findFirst({ where: { projectId, path: 'file1.txt' } });
    expect(file?.size).toBe(10);
  });
});
