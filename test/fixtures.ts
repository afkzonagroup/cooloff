import type { WithdrawalRequest } from '../src/core/schema.js';

export const SECRET = 'test-secret-0123456789-abcdefghijklmnop';

export function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Jane Doe',
    contract: 'ORDER-1001',
    email: 'jane@example.eu',
    idempotencyKey: 'k_0123456789abcdef',
    ...overrides,
  };
}

export const REQUEST: WithdrawalRequest = Object.freeze({
  name: 'Jane Doe',
  contract: 'ORDER-1001',
  email: 'jane@example.eu',
  items: Object.freeze([]),
  language: 'en',
  idempotencyKey: 'k_0123456789abcdef',
});

/** Strings commonly used to probe for HTML/script injection. */
export const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  "'><svg onload=alert(1)>",
  '<a href="javascript:alert(1)">x</a>',
  '{{constructor.constructor("alert(1)")()}}',
  '&lt;b&gt;',
];
