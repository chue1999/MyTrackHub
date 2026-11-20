import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isSensitiveKey, normalizeMsisdn, sanitizeProperties } from '../src/utils/sanitize.js';

describe('isSensitiveKey', () => {
  it('detects secrets', () => {
    for (const key of ['password', 'accessToken', 'PinCode', 'user_pin', 'otp', 'Authorization', 'cardNumber']) {
      assert.equal(isSensitiveKey(key), true, key);
    }
  });
  it('keeps ordinary keys that merely contain the letters', () => {
    for (const key of ['spinId', 'shipping', 'opinion', 'msisdn', 'Receiver']) {
      assert.equal(isSensitiveKey(key), false, key);
    }
  });
});

describe('sanitizeProperties', () => {
  it('drops sensitive keys at any depth', () => {
    const out = sanitizeProperties({ a: 1, password: 'x', nested: { otp: '1234', ok: true } });
    assert.deepEqual(out, { a: 1, nested: { ok: true } });
  });
  it('shortens long strings and long lists', () => {
    const out = sanitizeProperties({ text: 'x'.repeat(5000), list: Array.from({ length: 500 }, (_, i) => i) });
    assert.equal(out.text.length, 1000);
    assert.equal(out.list.length, 200);
  });
  it('returns an empty object for non-objects', () => {
    assert.deepEqual(sanitizeProperties(null), {});
    assert.deepEqual(sanitizeProperties('text'), {});
  });
});

describe('normalizeMsisdn', () => {
  it('normalises Lao numbers', () => {
    assert.equal(normalizeMsisdn('+856 20 5555 1234'), '2055551234');
    assert.equal(normalizeMsisdn('8562055551234'), '2055551234');
    assert.equal(normalizeMsisdn('020 5555 1234'), '2055551234');
  });
  it('rejects empty or too-short values', () => {
    assert.equal(normalizeMsisdn(''), null);
    assert.equal(normalizeMsisdn('123'), null);
  });
});
