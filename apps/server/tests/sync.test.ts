import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, server } from '../src/app.js';
import { db } from '../src/database/db.js';

describe('Sync API', () => {
  let accessToken: string;
  let deviceId: string;
  let workspaceId: string;
  let projectId: string;

  beforeAll(async () => {
    // 1. Register User
    const email = `sync_${Date.now()}@example.com`;
    await request(app).post('/api/v1/auth/register').send({
      email,
      password: 'password123',
      name: 'Sync Test User'
    });

    // 2. Login User to get Token
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'password123'
    });
    accessToken = loginRes.body.accessToken;

    // 3. Register Device
    const devRes = await request(app).post('/api/v1/devices/register')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        deviceName: 'Test Device 1',
        hostname: 'localhost',
        platform: 'win32',
        platformVersion: '10.0',
        appVersion: '1.0.0',
        publicKey: 'mock-key'
      });
    deviceId = devRes.body.device.id;

    // 4. Create Workspace
    const wsRes = await request(app).post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Sync Workspace' });
    workspaceId = wsRes.body.workspace.id;

    // 5. Create Project
    const projRes = await request(app).post('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Sync Project',
        workspaceId
      });
    projectId = projRes.body.project.id;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('should process a CREATE sync operation', async () => {
    const timestamp = new Date().toISOString();
    const res = await request(app).post(`/api/v1/sync/${projectId}/operations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        deviceId,
        operations: [{
          type: 'CREATE',
          path: 'test.txt',
          hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          size: 0,
          timestamp
        }]
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.processed).toBe(1);

    // Verify metadata was stored
    const files = await db.file.findMany({ where: { projectId } });
    expect(files.length).toBe(1);
    expect(files[0].path).toBe('test.txt');
    expect(files[0].isDeleted).toBe(false);
  });

  it('should pull the operations', async () => {
    const res = await request(app).get(`/api/v1/sync/${projectId}/operations`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.operations.length).toBeGreaterThan(0);
    expect(res.body.operations[0].path).toBe('test.txt');
  });

  it('should process a DELETE sync operation', async () => {
    const timestamp = new Date().toISOString();
    const res = await request(app).post(`/api/v1/sync/${projectId}/operations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        deviceId,
        operations: [{
          type: 'DELETE',
          path: 'test.txt',
          timestamp
        }]
      });

    expect(res.status).toBe(201);
    expect(res.body.processed).toBe(1);

    // Verify metadata was updated
    const files = await db.file.findMany({ where: { projectId } });
    expect(files.length).toBe(1);
    expect(files[0].path).toBe('test.txt');
    expect(files[0].isDeleted).toBe(true);
  });
});
