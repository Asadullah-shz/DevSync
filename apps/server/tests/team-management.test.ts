import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, server } from '../src/app.js';
import { db } from '../src/database/db.js';

describe('Team Management APIs', () => {
  let ownerToken: string;
  let ownerId: string;
  let viewerToken: string;
  let viewerId: string;
  let viewerEmail: string;
  let workspaceId: string;

  beforeAll(async () => {
    // Register Owner
    const ownerEmail = `owner_team_${Date.now()}@example.com`;
    await request(app).post('/api/v1/auth/register').send({ email: ownerEmail, password: 'password', name: 'Owner Team' });
    const ownerLogin = await request(app).post('/api/v1/auth/login').send({ email: ownerEmail, password: 'password' });
    ownerToken = ownerLogin.body.accessToken;
    ownerId = ownerLogin.body.user.id;

    // Register Viewer
    viewerEmail = `viewer_team_${Date.now()}@example.com`;
    await request(app).post('/api/v1/auth/register').send({ email: viewerEmail, password: 'password', name: 'Viewer Team' });
    const viewerLogin = await request(app).post('/api/v1/auth/login').send({ email: viewerEmail, password: 'password' });
    viewerToken = viewerLogin.body.accessToken;
    viewerId = viewerLogin.body.user.id;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('should create a workspace with the owner', async () => {
    const res = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Team Workspace' });

    expect(res.status).toBe(201);
    workspaceId = res.body.workspace.id;
    
    // Owner should be listed as a member
    const members = res.body.workspace.members;
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe('OWNER');
    expect(members[0].userId).toBe(ownerId);
  });

  it('owner should be able to invite a viewer by email', async () => {
    const res = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: viewerEmail, role: 'VIEWER' });

    expect(res.status).toBe(201);
    expect(res.body.member.userId).toBe(viewerId);
    expect(res.body.member.role).toBe('VIEWER');
  });

  it('viewer should be able to see the workspace', async () => {
    const res = await request(app)
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    const workspaces = res.body.workspaces;
    const ws = workspaces.find((w: any) => w.id === workspaceId);
    expect(ws).toBeDefined();
    expect(ws.members.length).toBeGreaterThanOrEqual(2);
  });

  it('viewer should NOT be able to invite another member', async () => {
    const dummyEmail = `dummy_${Date.now()}@example.com`;
    await request(app).post('/api/v1/auth/register').send({ email: dummyEmail, password: 'password', name: 'Dummy' });

    const res = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ email: dummyEmail, role: 'VIEWER' });

    expect(res.status).toBe(403);
  });

  it('owner should be able to update viewer role to editor', async () => {
    const res = await request(app)
      .put(`/api/v1/workspaces/${workspaceId}/members/${viewerId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'EDITOR' });

    expect(res.status).toBe(200);
    expect(res.body.member.role).toBe('EDITOR');
  });

  it('owner should be able to remove the editor', async () => {
    const res = await request(app)
      .delete(`/api/v1/workspaces/${workspaceId}/members/${viewerId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
  });

  it('editor should no longer see the workspace after being removed', async () => {
    const res = await request(app)
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    const workspaces = res.body.workspaces;
    const ws = workspaces.find((w: any) => w.id === workspaceId);
    expect(ws).toBeUndefined();
  });
});
