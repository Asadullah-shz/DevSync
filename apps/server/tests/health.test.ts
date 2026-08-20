import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, server } from '../src/app.js';

describe('Health & Metrics API', () => {
  let accessToken: string;

  beforeAll(async () => {
    // Register & Login to get token for Metrics endpoint
    const email = `health_${Date.now()}@example.com`;
    await request(app).post('/api/v1/auth/register').send({
      email,
      password: 'password123',
      name: 'Health User'
    });

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'password123'
    });
    accessToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /api/v1/health (Liveness) should return 200 OK', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });

  it('GET /api/v1/health/ready (Readiness) should return 200 READY', async () => {
    const res = await request(app).get('/api/v1/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('READY');
    expect(res.body.database).toBe('CONNECTED');
  });

  it('GET /api/v1/health/metrics should return 401 without auth', async () => {
    const res = await request(app).get('/api/v1/health/metrics');
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/health/metrics should return 200 with valid metrics when authenticated', async () => {
    const res = await request(app).get('/api/v1/health/metrics')
      .set('Authorization', `Bearer ${accessToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('system');
    expect(res.body.system).toHaveProperty('memory');
    expect(res.body.system).toHaveProperty('cpu');
    expect(res.body.system).toHaveProperty('disk');
    expect(res.body).toHaveProperty('devsync');
  });

  it('GET /dashboard should return 200 OK and serve HTML', async () => {
    const res = await request(app).get('/dashboard');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<!DOCTYPE html>');
    expect(res.text).toContain('DevSync — Server Monitor Dashboard');
  });
});
