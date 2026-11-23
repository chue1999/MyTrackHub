import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isUuid, likePattern, paging, period, phoneDigits } from '../src/utils/query.js';

describe('paging', () => {
  it('uses defaults and bounds', () => {
    assert.deepEqual(paging({}), { page: 1, pageSize: 20, offset: 0 });
    assert.deepEqual(paging({ page: '3', pageSize: '50' }), { page: 3, pageSize: 50, offset: 100 });
    assert.equal(paging({ pageSize: '99999' }, 100).pageSize, 100);
    assert.equal(paging({ page: '-4' }).page, 1);
  });
});

describe('period', () => {
  it('uses from/to when given', () => {
    const { since, until } = period({ from: '2026-01-01T00:00:00Z', to: '2026-01-31T00:00:00Z' }, 7);
    assert.equal(since.toISOString(), '2026-01-01T00:00:00.000Z');
    assert.equal(until.toISOString(), '2026-01-31T00:00:00.000Z');
  });
  it('swaps reversed bounds', () => {
    const { since, until } = period({ from: '2026-02-01', to: '2026-01-01' }, 7);
    assert.ok(since < until);
  });
  it('limits the period to about one year', () => {
    const { days } = period({ from: '2020-01-01', to: '2026-01-01' }, 7);
    assert.ok(days <= 366);
  });
});

describe('search helpers', () => {
  it('escapes LIKE wildcards (PostgreSQL)', () => assert.equal(likePattern('50%_a', 'postgres'), '%50\\%\\_a%'));
  it('escapes LIKE wildcards (SQL Server)', () => assert.equal(likePattern('50%_a[b', 'mssql'), '%50[%][_]a[[]b%'));
  it('reduces a phone search to digits', () => assert.equal(phoneDigits('+856 020-5555 1234'), '2055551234'));
  it('recognises UUIDs', () => {
    assert.equal(isUuid('86319844-d7ff-4a87-86e3-06379dcd9897'), true);
    assert.equal(isUuid('not-a-uuid'), false);
    assert.equal(isUuid(undefined), false);
  });
});
