import './setup-env.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { trackBatchSchema } = await import('../src/validators/track.validator.js');
const { createAccountSchema, updateAccountSchema } = await import('../src/validators/account.validator.js');
const { brandingSchema } = await import('../src/validators/settings.validator.js');

describe('trackBatchSchema', () => {
  it('accepts a normal batch and shortens long names', () => {
    const batch = trackBatchSchema.parse({ msisdn: '2055551234', events: [{ type: 'tap', name: 'x'.repeat(400) }] });
    assert.equal(batch.events[0].name.length, 150);
  });
  it('rejects unknown event types and empty batches', () => {
    assert.equal(trackBatchSchema.safeParse({ events: [{ type: 'hack', name: 'a' }] }).success, false);
    assert.equal(trackBatchSchema.safeParse({ events: [] }).success, false);
  });
});

describe('account schemas', () => {
  it('requires a strong enough password on create', () => {
    assert.equal(createAccountSchema.safeParse({ username: 'anna', password: 'short' }).success, false);
    assert.equal(createAccountSchema.parse({ username: 'anna', password: 'long-enough' }).role, 'viewer');
  });
  it('does not invent a role on partial updates', () => {
    assert.equal(updateAccountSchema.parse({ isActive: false }).role, undefined);
  });
});

describe('brandingSchema', () => {
  it('accepts partial updates and rejects non-images', () => {
    assert.deepEqual(brandingSchema.parse({ name: '  T-Plus  ' }), { name: 'T-Plus' });
    assert.equal(brandingSchema.safeParse({ logo: 'data:text/html;base64,PGgxPg==' }).success, false);
  });
});
