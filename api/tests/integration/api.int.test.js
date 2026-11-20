/**
 * End-to-end tests of the HTTP API against a real PostgreSQL database.
 *
 * Uses its own database (DB_NAME, default "mytplus_tracking_test"), which is
 * WIPED on every run. Run with:
 *   DB_PASSWORD=... npm run test:integration
 */
import '../setup-env.js';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';

process.env.DB_NAME ??= 'mytplus_tracking_test';
if (!/test/i.test(process.env.DB_NAME)) throw new Error('Refusing to run: DB_NAME must contain "test" (it is wiped).');

const { createApp } = await import('../../src/app.js');
const { ensureDatabase, sequelize } = await import('../../src/db/index.js');
const { Admin } = await import('../../src/models/index.js');
const { hashPassword } = await import('../../src/services/auth.service.js');

const app = createApp();
const KEY = { 'x-api-key': process.env.APP_API_KEY };
const api = (path) => `/api/v1/admin${path}`;
let adminToken;
let viewerToken;
let userId;

async function loginAs(username, password) {
  const res = await request(app).post(api('/auth/login')).send({ username, password });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.token;
}
const asAdmin = (req) => req.set('Authorization', `Bearer ${adminToken}`);
const asViewer = (req) => req.set('Authorization', `Bearer ${viewerToken}`);

before(async () => {
  await ensureDatabase();
  await sequelize.sync({ force: true });
  await Admin.create({ username: 'admin', passwordHash: await hashPassword('admin12345'), role: 'admin' });
  await Admin.create({ username: 'viewer', passwordHash: await hashPassword('viewer12345'), role: 'viewer' });
  adminToken = await loginAs('admin', 'admin12345');
  viewerToken = await loginAs('viewer', 'viewer12345');
});

after(async () => {
  await sequelize.close();
});

describe('tracking (app → API)', () => {
  it('stores a batch, creates the user and drops secrets', async () => {
    const res = await request(app)
      .post('/api/v1/track')
      .set(KEY)
      .send({
        msisdn: '+856 20 5555 1234',
        firstName: 'Somsack',
        lastName: 'Phommachanh',
        deviceId: 'dev-1',
        platform: 'android',
        appVersion: '3.0.1',
        events: [
          { type: 'login', name: 'login', sessionId: 's1' },
          { type: 'screen_view', name: 'RedeemPremium', sessionId: 's1' },
          { type: 'tap', name: 'Points', properties: { label: 'Points', otp: '123456', nested: { pin: '1' } } },
          {
            type: 'api',
            name: 'POST /tplus/TransferBalance',
            success: false,
            result: 'Not enough balance',
            properties: { request: { body: { Receiver: '2077778888', TransferAmount: '5000' } } },
          },
          { type: 'action', name: 'future', occurredAt: '2099-01-01T00:00:00Z' },
        ],
      });
    assert.equal(res.status, 202);
    assert.equal(res.body.accepted, 5);
  });

  it('finds the user by phone and name', async () => {
    const byPhone = await asAdmin(request(app).get(api('/users?search=020 5555'))).expect(200);
    assert.equal(byPhone.body.total, 1);
    assert.equal(byPhone.body.items[0].msisdn, '2055551234');
    assert.equal(byPhone.body.items[0].loginCount, 1);
    assert.equal(byPhone.body.items[0].failedCount, 1);
    userId = byPhone.body.items[0].id;
    const byName = await asAdmin(request(app).get(api('/users?search=somsack'))).expect(200);
    assert.equal(byName.body.total, 1);
  });

  it('never stores sensitive keys and clamps future dates', async () => {
    const res = await asAdmin(request(app).get(api(`/events?userId=${userId}&type=tap`))).expect(200);
    assert.deepEqual(res.body.items[0].properties, { label: 'Points', nested: {} });
    const future = await asAdmin(request(app).get(api('/events?search=future'))).expect(200);
    assert.ok(new Date(future.body.items[0].occurredAt) <= new Date());
  });
});

describe('admin: activity log', () => {
  it('filters by feature APIs, result and search (incl. numbers inside requests)', async () => {
    const byApi = await asAdmin(request(app).get(api('/events?apis=TransferBalance'))).expect(200);
    assert.equal(byApi.body.total, 1);
    const failed = await asAdmin(request(app).get(api('/events?success=false'))).expect(200);
    assert.equal(failed.body.total, 1);
    const receiver = await asAdmin(request(app).get(api('/events?search=2077778888'))).expect(200);
    assert.equal(receiver.body.total, 1);
    const byUserName = await asAdmin(request(app).get(api('/events?search=Phommachanh'))).expect(200);
    assert.equal(byUserName.body.total, 5);
  });

  it('returns one event with its user, and 404 for unknown ids', async () => {
    const list = await asAdmin(request(app).get(api('/events?pageSize=1'))).expect(200);
    const one = await asAdmin(request(app).get(api(`/events/${list.body.items[0].id}`))).expect(200);
    assert.equal(one.body.user.msisdn, '2055551234');
    await asAdmin(request(app).get(api('/events/999999'))).expect(404);
    await asAdmin(request(app).get(api('/events/abc'))).expect(404);
  });

  it('rejects an invalid userId filter', async () => {
    await asAdmin(request(app).get(api('/events?userId=nope'))).expect(400);
  });
});

describe('admin: dashboard and stats', () => {
  it('overview counts today and lists transfers', async () => {
    const res = await asAdmin(request(app).get(api('/stats/overview?days=7'))).expect(200);
    for (const key of ['totals', 'recentFailures', 'logouts', 'byType', 'apiResults', 'transfersToday', 'topApis']) {
      assert.ok(key in res.body, `overview response has "${key}"`);
    }
    assert.equal(res.body.totals.totalUsers, 1);
    assert.equal(res.body.totals.loginsToday, 1);
    assert.equal(res.body.daily.length, 7);
    assert.equal(res.body.recentTransfers[0].receiver, '2077778888');
    assert.equal(res.body.recentTransfers[0].amount, 5000);
  });

  it('packages and features answer', async () => {
    const pk = await asAdmin(request(app).get(api('/stats/packages'))).expect(200);
    assert.equal(pk.body.days, 30);
    // Shape the Packages page relies on.
    for (const key of ['totals', 'today', 'byChannel', 'topPackages', 'daily', 'recent', 'data', 'inUse', 'lowData']) {
      assert.ok(key in pk.body, `packages response has "${key}"`);
    }
    assert.deepEqual(Object.keys(pk.body.today).sort(), ['revenue', 'sold']);
    const ft = await asAdmin(request(app).get(api('/stats/features'))).expect(200);
    assert.equal(ft.body.apis[0].failed, 1);
  });
});

describe('admin: users', () => {
  it('shows a user detail and 404s for unknown ids', async () => {
    const res = await asAdmin(request(app).get(api(`/users/${userId}`))).expect(200);
    assert.equal(res.body.summary.totalEvents, 5);
    await asAdmin(request(app).get(api('/users/not-a-uuid'))).expect(404);
  });

  it('lets administrators (only) edit a user', async () => {
    const res = await asAdmin(
      request(app)
        .patch(api(`/users/${userId}`))
        .send({ note: 'VIP' }),
    ).expect(200);
    assert.equal(res.body.note, 'VIP');
    await asViewer(
      request(app)
        .patch(api(`/users/${userId}`))
        .send({ note: 'x' }),
    ).expect(403);
  });
});

describe('admin: accounts', () => {
  it('is for administrators only', async () => {
    await asViewer(request(app).get(api('/accounts'))).expect(403);
  });

  it('creates, updates (without touching other fields) and deletes', async () => {
    const created = await asAdmin(
      request(app).post(api('/accounts')).send({ username: 'anna', password: 'password1', role: 'admin' }),
    ).expect(201);
    assert.equal(created.body.passwordHash, undefined);
    await asAdmin(request(app).post(api('/accounts')).send({ username: 'anna', password: 'password1' })).expect(409);

    const updated = await asAdmin(
      request(app)
        .patch(api(`/accounts/${created.body.id}`))
        .send({ displayName: 'Anna' }),
    ).expect(200);
    assert.equal(updated.body.role, 'admin', 'a partial update must keep the role');

    await asAdmin(request(app).delete(api(`/accounts/${created.body.id}`))).expect(204);
    await asAdmin(request(app).delete(api('/accounts/99999'))).expect(404);
  });

  it('keeps at least one active administrator and protects your own account', async () => {
    const me = await asAdmin(request(app).get(api('/auth/me'))).expect(200);
    const demote = await asAdmin(
      request(app)
        .patch(api(`/accounts/${me.body.id}`))
        .send({ role: 'viewer' }),
    );
    assert.equal(demote.status, 400);
    await asAdmin(request(app).delete(api(`/accounts/${me.body.id}`))).expect(400);
  });
});

describe('admin: auth', () => {
  it('rejects wrong passwords with a clear message', async () => {
    const res = await request(app).post(api('/auth/login')).send({ username: 'admin', password: 'nope' });
    assert.equal(res.status, 401);
    assert.equal(res.body.message, 'Wrong username or password');
  });

  it('changes the own password', async () => {
    await asViewer(
      request(app).post(api('/auth/password')).send({ currentPassword: 'wrong', newPassword: 'viewer67890' }),
    ).expect(400);
    await asViewer(
      request(app).post(api('/auth/password')).send({ currentPassword: 'viewer12345', newPassword: 'viewer67890' }),
    ).expect(200);
    viewerToken = await loginAs('viewer', 'viewer67890');
  });

  it('still answers on the legacy /api/admin paths', async () => {
    await request(app).get('/api/admin/auth/me').set('Authorization', `Bearer ${adminToken}`).expect(200);
  });
});

describe('admin: settings', () => {
  it('auto delete: preview, validation, viewer read-only', async () => {
    const info = await asViewer(request(app).get(api('/settings/retention?months=6'))).expect(200);
    assert.equal(info.body.months, 4);
    assert.equal(info.body.preview.months, 6);
    await asAdmin(request(app).put(api('/settings/retention')).send({ enabled: true, months: 5 })).expect(400);
    await asViewer(request(app).put(api('/settings/retention')).send({ enabled: false, months: 4 })).expect(403);
    const saved = await asAdmin(
      request(app).put(api('/settings/retention')).send({ enabled: true, months: 12 }),
    ).expect(200);
    assert.equal(saved.body.months, 12);
    assert.equal(saved.body.lastRun.by, 'admin');
  });

  it('branding: partial updates and the public endpoint', async () => {
    await asAdmin(request(app).put(api('/settings/branding')).send({ name: '' })).expect(400);
    await asAdmin(request(app).put(api('/settings/branding')).send({ name: 'T-Plus', title: 'T-Plus Admin' })).expect(
      200,
    );
    const pub = await request(app).get('/api/v1/public/branding').expect(200);
    assert.equal(pub.body.name, 'T-Plus');
    assert.equal(pub.body.subtitle, 'Activity Center');
    assert.equal(pub.body.logo, null);
    await request(app).get('/api/public/branding').expect(200);
  });
});
