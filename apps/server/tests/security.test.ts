import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, server } from '../src/app.js';
import { db } from '../src/database/db.js';

describe('Security API (RBAC)', () => {
  let ownerToken: string;
  let viewerToken: string;
  let workspaceId: string;

  beforeAll(async () => {
    // 1. Register Owner
    const ownerEmail = `owner_${Date.now()}@example.com`;
    await request(app).post('/api/v1/auth/register').send({ email: ownerEmail, password: 'password', name: 'Owner' });
    const ownerLogin = await request(app).post('/api/v1/auth/login').send({ email: ownerEmail, password: 'password' });
    ownerToken = ownerLogin.body.accessToken;

    // 2. Register Viewer
    const viewerEmail = `viewer_${Date.now()}@example.com`;
    await request(app).post('/api/v1/auth/register').send({ email: viewerEmail, password: 'password', name: 'Viewer' });
    const viewerLogin = await request(app).post('/api/v1/auth/login').send({ email: viewerEmail, password: 'password' });
    viewerToken = viewerLogin.body.accessToken;

    // 3. Create Workspace (Owner)
    const wsRes = await request(app).post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'RBAC Workspace' });
    workspaceId = wsRes.body.workspace.id;

    // 4. Add Viewer to Workspace
    await db.workspaceMember.create({
      data: {
        id: `wm_${Date.now()}`,
        workspaceId,
        userId: viewerLogin.body.user.id,
        role: 'VIEWER'
      }
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('Owner should be able to create a project', async () => {
    const res = await request(app).post('/api/v1/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Owner Project', workspaceId });
    
    expect(res.status).toBe(201);
  });

  it('Viewer should NOT be able to create a project', async () => {
    const res = await request(app).post('/api/v1/projects')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'Viewer Project', workspaceId });
    
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('Insufficient permissions for this action');
  });

  it('Viewer should be able to list projects', async () => {
    const res = await request(app).get(`/api/v1/projects`)
      .set('Authorization', `Bearer ${viewerToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.projects.length).toBeGreaterThanOrEqual(1);
  });
});
