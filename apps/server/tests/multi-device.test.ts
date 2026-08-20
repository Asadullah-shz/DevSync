import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, server } from '../src/app.js';
import { db } from '../src/database/db.js';

describe('Multi-Device Sync API', () => {
  let accessToken: string;
  let device1: string;
  let device2: string;
  let workspaceId: string;
  let projectId: string;

  beforeAll(async () => {
    const email = `multi_${Date.now()}@example.com`;
    await request(app).post('/api/v1/auth/register').send({ email, password: 'password', name: 'Multi User' });
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password: 'password' });
    accessToken = loginRes.body.accessToken;

    const dev1Res = await request(app).post('/api/v1/devices/register')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ deviceName: 'Dev1', hostname: 'host1', platform: 'win32', platformVersion: '10', appVersion: '1', publicKey: 'k1' });
    device1 = dev1Res.body.device.id;

    const dev2Res = await request(app).post('/api/v1/devices/register')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ deviceName: 'Dev2', hostname: 'host2', platform: 'win32', platformVersion: '10', appVersion: '1', publicKey: 'k2' });
    device2 = dev2Res.body.device.id;

    const wsRes = await request(app).post('/api/v1/workspaces').set('Authorization', `Bearer ${accessToken}`).send({ name: 'WS' });
    workspaceId = wsRes.body.workspace.id;

    const projRes = await request(app).post('/api/v1/projects').set('Authorization', `Bearer ${accessToken}`).send({ name: 'Proj', workspaceId });
    projectId = projRes.body.project.id;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('Device 2 should pull operations created by Device 1', async () => {
    const timestamp = new Date().toISOString();
    
    // 1. Device 1 pushes a change
    await request(app).post(`/api/v1/sync/${projectId}/operations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        deviceId: device1,
        operations: [{ type: 'CREATE', path: 'dev1.txt', hash: 'h1', size: 5, timestamp }]
      });

    // 2. Device 2 pulls operations
    const pullRes = await request(app).get(`/api/v1/sync/${projectId}/operations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ deviceId: device2 });

    expect(pullRes.status).toBe(200);
    const ops = pullRes.body.operations;
    expect(ops.length).toBeGreaterThan(0);
    const hasOp = ops.some((o: any) => o.path === 'dev1.txt' && o.deviceId === device1);
    expect(hasOp).toBe(true);
  });
});
