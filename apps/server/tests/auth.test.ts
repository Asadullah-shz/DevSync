import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, server } from '../src/app.js';
import { db } from '../src/database/db.js';

describe('Auth API', () => {
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('should register a new user', async () => {
    const email = `test_${Date.now()}@example.com`;
    const res = await request(app).post('/api/v1/auth/register').send({
      email,
      password: 'password123',
      name: 'Test User'
    });

    if (res.status !== 201) console.log(res.body);
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email);
  });

  it('should login an existing user', async () => {
    const email = `testlogin_${Date.now()}@example.com`;
    // Note: Database is cleared after each test by setup.ts, so we must register again
    await request(app).post('/api/v1/auth/register').send({
      email,
      password: 'password123',
      name: 'Test Login User'
    });

    const res = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'password123',
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
  });
});
