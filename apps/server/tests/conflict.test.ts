import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, server } from '../src/app.js';
import { db } from '../src/database/db.js';

describe('Conflict API', () => {
  let accessToken: string;
  let deviceA: string;
  let deviceB: string;
  let workspaceId: string;
  let projectId: string;

  beforeAll(async () => {
    const email = `conflict_${Date.now()}@example.com`;
    await request(app).post('/api/v1/auth/register').send({
      email,
      password: 'password123',
      name: 'Conflict Test User'
    });

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'password123'
    });
    accessToken = loginRes.body.accessToken;

    const devARes = await request(app).post('/api/v1/devices/register')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        deviceName: 'Device A',
        hostname: 'localhost',
        platform: 'win32',
        platformVersion: '10.0',
        appVersion: '1.0.0',
        publicKey: 'mock-key-a'
      });
    deviceA = devARes.body.device.id;

    const devBRes = await request(app).post('/api/v1/devices/register')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        deviceName: 'Device B',
        hostname: 'localhost',
        platform: 'win32',
        platformVersion: '10.0',
        appVersion: '1.0.0',
        publicKey: 'mock-key-b'
      });
    deviceB = devBRes.body.device.id;

    const wsRes = await request(app).post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Conflict Workspace' });
    workspaceId = wsRes.body.workspace.id;

    const projRes = await request(app).post('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Conflict Project', workspaceId });
    projectId = projRes.body.project.id;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('should detect a conflict when two devices modify from the same base version', async () => {
    // 1. Device A creates file
    const t0 = new Date().toISOString();
    await request(app).post(`/api/v1/sync/${projectId}/operations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        deviceId: deviceA,
        operations: [{
          type: 'CREATE',
          path: 'shared.txt',
          hash: 'hash-v1',
          size: 10,
          timestamp: t0
        }]
      });

    // 2. Device A modifies file (clientCursor is t0)
    const t1 = new Date().toISOString();
    await request(app).post(`/api/v1/sync/${projectId}/operations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        deviceId: deviceA,
        clientCursor: t0,
        operations: [{
          type: 'MODIFY',
          path: 'shared.txt',
          hash: 'hash-v2-from-a',
          size: 15,
          timestamp: t1
        }]
      });

    // 3. Device B modifies file based on t0 (concurrent edit!)
    const t2 = new Date().toISOString();
    const conflictRes = await request(app).post(`/api/v1/sync/${projectId}/operations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        deviceId: deviceB,
        clientCursor: t0, // Device B hasn't seen t1 yet
        operations: [{
          type: 'MODIFY',
          path: 'shared.txt',
          hash: 'hash-v2-from-b',
          size: 20,
          timestamp: t2
        }]
      });

    expect(conflictRes.status).toBe(201);
    // Only 1 operation was processed, but it resulted in a conflict
    expect(conflictRes.body.conflicts.length).toBe(1);
    expect(conflictRes.body.conflicts[0].path).toBe('shared.txt');
    expect(conflictRes.body.conflicts[0].status).toBe('UNRESOLVED');

    // Verify DB
    const conflicts = await db.conflict.findMany({ where: { projectId } });
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].incomingHash).toBe('hash-v2-from-b');
  }, 15000);
});
