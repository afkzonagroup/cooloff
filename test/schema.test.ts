import { describe, expect, it } from 'vitest';

import { isValidEmail, LIMITS, validateWithdrawalRequest, type ValidationResult } from '../src/core/schema.js';
import { validBody } from './fixtures.js';

function errorsOf(result: ValidationResult): string[] {
  return result.ok ? [] : result.errors.map((e) => `${e.field}:${e.code}`);
}

describe('validateWithdrawalRequest', () => {
  it('accepts a complete statement and normalises it', () => {
    const result = validateWithdrawalRequest(validBody({ name: '  Jane   Doe ', email: 'Jane@Example.EU' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      name: 'Jane Doe',
      contract: 'ORDER-1001',
      email: 'Jane@example.eu',
      items: [],
      language: 'en',
      idempotencyKey: 'k_0123456789abcdef',
    });
    expect(Object.isFrozen(result.value)).toBe(true);
  });

  it.each([null, undefined, 'string', 42, [], new Date(), Object.create({ name: 'x' }) as unknown])(
    'refuses a body that is not a plain object: %s',
    (body) => {
      expect(errorsOf(validateWithdrawalRequest(body))).toEqual(['_:not_an_object']);
    },
  );

  it('accepts an object with a null prototype', () => {
    const body = Object.assign(Object.create(null) as object, validBody());
    expect(validateWithdrawalRequest(body).ok).toBe(true);
  });

  it('refuses unknown fields, including __proto__ from JSON', () => {
    expect(errorsOf(validateWithdrawalRequest(validBody({ admin: true })))).toEqual(['_:unknown_field']);
    const parsed: unknown = JSON.parse('{"__proto__":{"x":1},"name":"a","contract":"b","email":"a@b.eu","idempotencyKey":"k_0123456789abcdef"}');
    expect(errorsOf(validateWithdrawalRequest(parsed))).toEqual(['_:unknown_field']);
  });

  describe.each(['name', 'contract'] as const)('%s (Art. 11a(2)(a)/(b))', (field) => {
    const max = field === 'name' ? LIMITS.nameMaxLength : LIMITS.contractMaxLength;
    it('is required', () => {
      expect(errorsOf(validateWithdrawalRequest(validBody({ [field]: undefined })))).toEqual([`${field}:required`]);
      expect(errorsOf(validateWithdrawalRequest(validBody({ [field]: null })))).toEqual([`${field}:required`]);
      expect(errorsOf(validateWithdrawalRequest(validBody({ [field]: '   ' })))).toEqual([`${field}:required`]);
      expect(errorsOf(validateWithdrawalRequest(validBody({ [field]: String.fromCodePoint(0x200b) })))).toEqual([`${field}:required`]);
    });
    it('must be a string', () => {
      expect(errorsOf(validateWithdrawalRequest(validBody({ [field]: 123 })))).toEqual([`${field}:invalid_type`]);
      expect(errorsOf(validateWithdrawalRequest(validBody({ [field]: ['a'] })))).toEqual([`${field}:invalid_type`]);
    });
    it(`is at most ${String(max)} characters after normalising`, () => {
      expect(validateWithdrawalRequest(validBody({ [field]: 'a'.repeat(max) })).ok).toBe(true);
      expect(errorsOf(validateWithdrawalRequest(validBody({ [field]: 'a'.repeat(max + 1) })))).toEqual([`${field}:too_long`]);
      expect(errorsOf(validateWithdrawalRequest(validBody({ [field]: 'a'.repeat(max * 10) })))).toEqual([`${field}:too_long`]);
      expect(validateWithdrawalRequest(validBody({ [field]: ` ${'a'.repeat(max)}    ` })).ok).toBe(true);
    });
  });

  describe('email (Art. 11a(2)(c))', () => {
    it('is required', () => {
      expect(errorsOf(validateWithdrawalRequest(validBody({ email: undefined })))).toEqual(['email:required']);
      expect(errorsOf(validateWithdrawalRequest(validBody({ email: '  ' })))).toEqual(['email:required']);
    });
    it('must be a string', () => {
      expect(errorsOf(validateWithdrawalRequest(validBody({ email: {} })))).toEqual(['email:invalid_type']);
    });
    it('must be valid', () => {
      expect(errorsOf(validateWithdrawalRequest(validBody({ email: 'not-an-email' })))).toEqual(['email:invalid_email']);
    });
    it('is limited in length', () => {
      const long = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.eu`;
      expect(errorsOf(validateWithdrawalRequest(validBody({ email: long })))).toEqual(['email:too_long']);
      expect(errorsOf(validateWithdrawalRequest(validBody({ email: 'a'.repeat(5000) })))).toEqual(['email:too_long']);
    });
  });

  describe('items (recital 37, optional partial withdrawal)', () => {
    it('are refused unless partial withdrawal is allowed', () => {
      expect(errorsOf(validateWithdrawalRequest(validBody({ items: ['Shoes'] })))).toEqual(['items:partial_not_allowed']);
    });
    it('are accepted and normalised when allowed; empty ones dropped', () => {
      const result = validateWithdrawalRequest(validBody({ items: [' Shoes ', '', '  '] }), { allowPartial: true });
      expect(result.ok && result.value.items).toEqual(['Shoes']);
    });
    it('an empty list means the whole contract and is always fine', () => {
      expect(validateWithdrawalRequest(validBody({ items: [] })).ok).toBe(true);
      expect(validateWithdrawalRequest(validBody({ items: null })).ok).toBe(true);
    });
    it('must be an array of strings', () => {
      expect(errorsOf(validateWithdrawalRequest(validBody({ items: 'Shoes' }), { allowPartial: true }))).toEqual(['items:invalid_type']);
      expect(errorsOf(validateWithdrawalRequest(validBody({ items: [1] }), { allowPartial: true }))).toEqual(['items:invalid_type']);
    });
    it('are limited in count and length', () => {
      const many = Array.from({ length: LIMITS.itemsMaxCount + 1 }, (_, i) => `item ${String(i)}`);
      expect(errorsOf(validateWithdrawalRequest(validBody({ items: many }), { allowPartial: true }))).toEqual(['items:too_many_items']);
      expect(errorsOf(validateWithdrawalRequest(validBody({ items: ['x'.repeat(LIMITS.itemMaxLength + 1)] }), { allowPartial: true }))).toEqual(['items:item_too_long']);
      expect(errorsOf(validateWithdrawalRequest(validBody({ items: ['x'.repeat(5000)] }), { allowPartial: true }))).toEqual(['items:item_too_long']);
    });
  });

  describe('language', () => {
    it('defaults to English or the configured default', () => {
      const a = validateWithdrawalRequest(validBody());
      expect(a.ok && a.value.language).toBe('en');
      const b = validateWithdrawalRequest(validBody(), { defaultLanguage: 'lt' });
      expect(b.ok && b.value.language).toBe('lt');
    });
    it('accepts official codes only', () => {
      const ok = validateWithdrawalRequest(validBody({ language: 'de' }));
      expect(ok.ok && ok.value.language).toBe('de');
      expect(errorsOf(validateWithdrawalRequest(validBody({ language: 'de-AT' })))).toEqual(['language:invalid_language']);
      expect(errorsOf(validateWithdrawalRequest(validBody({ language: 'xx' })))).toEqual(['language:invalid_language']);
      expect(errorsOf(validateWithdrawalRequest(validBody({ language: 1 })))).toEqual(['language:invalid_language']);
    });
  });

  describe('idempotencyKey', () => {
    it.each([undefined, 1, '', 'short', 'x'.repeat(65), 'k_0123456789abcde!', 'k 0123456789abcdef'])('refuses %s', (key) => {
      expect(errorsOf(validateWithdrawalRequest(validBody({ idempotencyKey: key })))).toEqual(['idempotencyKey:invalid_idempotency_key']);
    });
    it('accepts 16 and 64 characters', () => {
      expect(validateWithdrawalRequest(validBody({ idempotencyKey: 'a'.repeat(16) })).ok).toBe(true);
      expect(validateWithdrawalRequest(validBody({ idempotencyKey: 'a'.repeat(64) })).ok).toBe(true);
    });
  });

  it('reports every invalid field at once', () => {
    expect(errorsOf(validateWithdrawalRequest({}))).toEqual([
      'name:required',
      'contract:required',
      'email:required',
      'idempotencyKey:invalid_idempotency_key',
    ]);
  });
});

describe('isValidEmail', () => {
  it.each([
    'jane@example.eu',
    'jane.doe+withdrawal@shop.example.co.uk',
    'jonas.petraitis@pavyzdys.lt',
    'žydrūnas@pavyzdys.lt',
    'user@xn--bcher-kva.example',
    "o'brien@example.ie",
  ])('accepts %s', (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each([
    '',
    'plain',
    '@example.eu',
    'jane@',
    'jane@example',
    'jane@@example.eu',
    'jane@exa mple.eu',
    'jane@example.123',
    'jane..doe@example.eu',
    '.jane@example.eu',
    'jane.@example.eu',
    'jane@-example.eu',
    'jane@example-.eu',
    'jane@example..eu',
    '"jane"@example.eu',
    'jane@[192.0.2.1]',
    'jane@example.eu\r\nBcc: victim@example.eu',
    'jane@example.eu\nX: y',
    `jane${String.fromCodePoint(0x202e)}@example.eu`,
    `${'a'.repeat(65)}@example.eu`,
    `jane@${'a'.repeat(64)}.eu`,
    `jane@${'a.'.repeat(130)}eu`,
  ])('refuses %j', (email) => {
    expect(isValidEmail(email)).toBe(false);
  });
});
