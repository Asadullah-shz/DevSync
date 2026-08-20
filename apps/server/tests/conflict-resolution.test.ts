import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, server } from '../src/app.js';
import { db } from '../src/database/db.js';
import fsPromises from 'fs/promises';
import path from 'path';

describe('V2 Conflict Resolution Engine', () => {
  let accessToken: string;
  let deviceA: string;
  let deviceB: string;
  let workspaceId: string;
  let projectId: string;
  let fileId: string;
  
  // Dummy incoming conflicting hash
  const INCOMING_HASH = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const INCOMING_CONTENT = 'Conflicting client content';

  beforeAll(async () => {
    // 1. Setup mock user and workspace/project/device identities
    const email = `conflict_res_${Date.now()}@example.com`;
    await request(app).post('/api/v1/auth/register').send({ email, password: 'password', name: 'User' });
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password: 'password' });
    accessToken = loginRes.body.accessToken;

    const devARes = await request(app).post('/api/v1/devices/register')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ deviceName: 'DevA', hostname: 'hostA', platform: 'win', platformVersion: '1', appVersion: '1', publicKey: 'k1' });
    deviceA = devARes.body.device.id;

    const devBRes = await request(app).post('/api/v1/devices/register')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ deviceName: 'DevB', hostname: 'hostB', platform: 'win', platformVersion: '1', appVersion: '1', publicKey: 'k2' });
    deviceB = devBRes.body.device.id;

    const wsRes = await request(app).post('/api/v1/workspaces').set('Authorization', `Bearer ${accessToken}`).send({ name: 'WS' });
    workspaceId = wsRes.body.workspace.id;

    const projRes = await request(app).post('/api/v1/projects').set('Authorization', `Bearer ${accessToken}`).send({ name: 'Proj', workspaceId });
    projectId = projRes.body.project.id;

    // 2. Pre-create a file record
    fileId = `FIL-${Date.now()}`;
    await db.file.create({
      data: {
        id: fileId,
        projectId,
        path: 'src/main.js',
        hash: 'server-hash-original',
        size: 50,
        modifiedAt: new Date()
      }
    });

    // Write original and conflicting dummy objects to server CAS storage
    const objOriginalPath = path.join(process.cwd(), 'storage', 'objects', 'se', 'server-hash-original');
    await fsPromises.mkdir(path.dirname(objOriginalPath), { recursive: true });
    await fsPromises.writeFile(objOriginalPath, 'Original server content');

    const objIncomingPath = path.join(process.cwd(), 'storage', 'objects', INCOMING_HASH.substring(0, 2), INCOMING_HASH);
    await fsPromises.mkdir(path.dirname(objIncomingPath), { recursive: true });
    await fsPromises.writeFile(objIncomingPath, INCOMING_CONTENT);
  });

  afterAll(async () => {
    // Cleanup storage files created during test
    await fsPromises.rm(path.join(process.cwd(), 'storage', 'objects', 'se'), { recursive: true, force: true }).catch(() => {});
    await fsPromises.rm(path.join(process.cwd(), 'storage', 'objects', INCOMING_HASH.substring(0, 2)), { recursive: true, force: true }).catch(() => {});
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('should resolve a conflict keeping the server version (KEEP_SERVER)', async () => {
    // Create an unresolved conflict
    const conflictId = `CON-${Date.now()}-1`;
    await db.conflict.create({
      data: {
        id: conflictId,
        projectId,
        fileId,
        path: 'src/main.js',
        baseVersionHash: 'base-hash',
        incomingHash: INCOMING_HASH,
        deviceA,
        deviceB,
        status: 'UNRESOLVED'
      }
    });

    const res = await request(app)
      .post(`/api/v1/conflicts/${projectId}/conflicts/${conflictId}/resolve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ resolution: 'KEEP_SERVER' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.conflict.status).toBe('RESOLVED');
    expect(res.body.resolvedFile).toBeNull();

    // original file should not have changed
    const file = await db.file.findUnique({ where: { id: fileId } });
    expect(file?.hash).toBe('server-hash-original');
  });

  it('should resolve a conflict keeping the client version (KEEP_MINE)', async () => {
    const conflictId = `CON-${Date.now()}-2`;
    await db.conflict.create({
      data: {
        id: conflictId,
        projectId,
        fileId,
        path: 'src/main.js',
        baseVersionHash: 'base-hash',
        incomingHash: INCOMING_HASH,
        deviceA,
        deviceB,
        status: 'UNRESOLVED'
      }
    });

    const res = await request(app)
      .post(`/api/v1/conflicts/${projectId}/conflicts/${conflictId}/resolve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ resolution: 'KEEP_MINE' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.conflict.status).toBe('RESOLVED');
    expect(res.body.resolvedFile.hash).toBe(INCOMING_HASH);
    expect(res.body.resolvedFile.size).toBe(INCOMING_CONTENT.length);

    // Active file should now point to client's incoming hash
    const file = await db.file.findUnique({ where: { id: fileId } });
    expect(file?.hash).toBe(INCOMING_HASH);
  });

  it('should resolve a conflict keeping both versions (KEEP_BOTH)', async () => {
    const conflictId = `CON-${Date.now()}-3`;
    await db.conflict.create({
      data: {
        id: conflictId,
        projectId,
        fileId,
        path: 'src/main.js',
        baseVersionHash: 'base-hash',
        incomingHash: INCOMING_HASH,
        deviceA,
        deviceB,
        status: 'UNRESOLVED'
      }
    });

    const res = await request(app)
      .post(`/api/v1/conflicts/${projectId}/conflicts/${conflictId}/resolve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ resolution: 'KEEP_BOTH' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.conflict.status).toBe('RESOLVED');
    expect(res.body.resolvedFile.path).toBe(`src/main_conflict_${deviceB.substring(deviceB.length - 8)}.js`);

    // Verify a new file record was created for the conflict file
    const originalFile = await db.file.findUnique({ where: { id: fileId } });
    const conflictFile = await db.file.findUnique({ where: { id: res.body.resolvedFile.id } });
    
    expect(originalFile?.hash).toBe(INCOMING_HASH); // From the previous KEEP_MINE test
    expect(conflictFile?.hash).toBe(INCOMING_HASH);
  });
});
