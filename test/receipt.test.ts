import { describe, expect, it } from 'vitest';

import {
  assertSecret,
  base32Crockford,
  canonicalRequest,
  computeReceiptId,
  idempotencyStorageKey,
  timingSafeEqual,
} from '../src/core/receipt.js';
import { REQUEST, SECRET } from './fixtures.js';

describe('base32Crockford', () => {
  it('encodes known vectors', () => {
    expect(base32Crockford(new Uint8Array([]))).toBe('');
    expect(base32Crockford(new Uint8Array([0]))).toBe('00');
    expect(base32Crockford(new Uint8Array([0xff]))).toBe('ZW');
    expect(base32Crockford(new TextEncoder().encode('foobar'))).toBe('CSQPYRK1E8');
    expect(base32Crockford(new Uint8Array(10).fill(0xff))).toBe('ZZZZZZZZZZZZZZZZ');
  });
});

describe('computeReceiptId', () => {
  it('has the documented format', async () => {
    expect(await computeReceiptId(SECRET, REQUEST)).toMatch(/^WD-[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/u);
  });

  it('is deterministic', async () => {
    expect(await computeReceiptId(SECRET, REQUEST)).toBe(await computeReceiptId(SECRET, { ...REQUEST }));
  });

  it.each([
    ['name', { name: 'Jane Do' }],
    ['contract', { contract: 'ORDER-1002' }],
    ['email', { email: 'jane@example.com' }],
    ['items', { items: ['Shoes'] }],
    ['language', { language: 'de' as const }],
    ['idempotencyKey', { idempotencyKey: 'k_0123456789abcdeX' }],
  ])('changes when %s changes', async (_field, change) => {
    expect(await computeReceiptId(SECRET, { ...REQUEST, ...change })).not.toBe(await computeReceiptId(SECRET, REQUEST));
  });

  it('changes with the secret', async () => {
    expect(await computeReceiptId(`${SECRET}x`, REQUEST)).not.toBe(await computeReceiptId(SECRET, REQUEST));
  });

  it('serialises without ambiguity between fields', () => {
    const a = canonicalRequest({ ...REQUEST, name: 'a","b', contract: 'c' });
    const b = canonicalRequest({ ...REQUEST, name: 'a', contract: 'b","c' });
    expect(a).not.toBe(b);
  });

  it('refuses short secrets', async () => {
    expect(() => {
      assertSecret('short');
    }).toThrow(TypeError);
    await expect(computeReceiptId('x'.repeat(31), REQUEST)).rejects.toThrow(TypeError);
  });
});

describe('idempotencyStorageKey', () => {
  it('is a 64-character hex HMAC that does not contain the key', async () => {
    const key = await idempotencyStorageKey(SECRET, REQUEST.idempotencyKey);
    expect(key).toMatch(/^[0-9a-f]{64}$/u);
    expect(key).not.toContain(REQUEST.idempotencyKey);
    expect(await idempotencyStorageKey(SECRET, REQUEST.idempotencyKey)).toBe(key);
  });
});

describe('timingSafeEqual', () => {
  it('compares correctly', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(true);
    expect(timingSafeEqual('é', 'e')).toBe(false);
  });
});
