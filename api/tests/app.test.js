import './setup-env.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import request from 'supertest';

// HTTP behaviour that needs no database: routing, auth checks, error format.
const { createApp } = await import('../src/app.js');
const app = createApp();

describe('API (no database)', () => {
  it('answers unknown routes with a JSON 404', async () => {
    const res = await request(app).get('/api/v1/nope');
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'NOT_FOUND');
  });

  it('rejects the track endpoint without the app key', async () => {
    const res = await request(app)
      .post('/api/v1/track')
      .send({ events: [{ type: 'tap', name: 'x' }] });
    assert.equal(res.status, 401);
    assert.equal(res.body.message, 'Invalid API key');
  });

  it('validates the track payload', async () => {
    const res = await request(app).post('/api/v1/track').set('x-api-key', process.env.APP_API_KEY).send({ events: [] });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });

  it('requires a login for admin routes (new and legacy paths)', async () => {
    for (const path of ['/api/v1/admin/users', '/api/admin/users']) {
      const res = await request(app).get(path);
      assert.equal(res.status, 401, path);
      assert.equal(res.body.code, 'UNAUTHORIZED');
    }
  });

  it('rejects invalid JSON bodies', async () => {
    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .set('Content-Type', 'application/json')
      .send('{bad json');
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_JSON');
  });

  it('sends security headers', async () => {
    const res = await request(app).get('/api/v1/nope');
    assert.equal(res.headers['x-powered-by'], undefined);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
  });
});
