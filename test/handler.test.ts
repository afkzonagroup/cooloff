import { describe, expect, it } from 'vitest';

import { createWithdrawalHandler } from '../src/server/handler.js';
import { checkOrigin, isJsonContentType, normaliseOrigin, readBodyWithLimit, SECURITY_HEADERS } from '../src/server/http.js';
import { MemoryRateLimiter } from '../src/server/rate-limit.js';
import type { RateLimitResult, WithdrawalStore } from '../src/server/types.js';
import { SECRET, validBody } from './fixtures.js';
import { ENDPOINT, ORIGIN, post, RecordingNotifier, setup } from './server-helpers.js';

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe('withdrawal handler: success path', () => {
  it('records the statement, sends the acknowledgement and returns the receipt (201)', async () => {
    const { handler, store, notifier } = setup();
    const response = await handler(post(), { clientAddress: '203.0.113.1' });
    expect(response.status).toBe(201);
    const body = await json(response);
    expect(body['receiptId']).toMatch(/^WD-/u);
    expect(body['acknowledgement']).toBe('sent');
    expect(body['submittedAt']).toEqual({
      utc: '2026-06-19T08:30:00.000Z',
      local: '2026-06-19T11:30:00+03:00',
      timeZone: 'Europe/Vilnius',
    });
    expect(body['statement']).toEqual({
      name: 'Jane Doe',
      contract: 'ORDER-1001',
      email: 'jane@example.eu',
      items: [],
      language: 'en',
    });
    const records = store.list();
    expect(records).toHaveLength(1);
    expect(records[0]?.receiptId).toBe(body['receiptId']);
    expect(records[0]?.acknowledgedAt).toBe('2026-06-19T08:30:00.000Z');
    expect(JSON.stringify(records)).not.toContain('k_0123456789abcdef');
    expect(notifier.sent).toHaveLength(1);
    expect(notifier.sent[0]?.to).toBe('jane@example.eu');
    expect(notifier.sent[0]?.text).toContain(String(body['receiptId']));
  });

  it('sets security headers on every response', async () => {
    const { handler } = setup();
    for (const response of [await handler(post()), await handler(new Request(ENDPOINT))]) {
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        expect(response.headers.get(name)).toBe(value);
      }
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
    }
  });

  it('calls onWithdrawal once per new withdrawal and survives hook errors', async () => {
    let calls = 0;
    const { handler, errors } = setup({
      onWithdrawal: () => {
        calls += 1;
        throw new Error('hook failed');
      },
    });
    expect((await handler(post())).status).toBe(201);
    expect((await handler(post())).status).toBe(200);
    expect(calls).toBe(1);
    expect(errors.map(([phase]) => phase)).toEqual(['hook']);
  });

  it('uses per-language message overrides', async () => {
    const { handler, notifier } = setup({ messages: { de: { traderLabel: 'Händler' } } });
    await handler(post(validBody({ language: 'de' })));
    expect(notifier.sent[0]?.text).toContain('Händler: Example Shop');
  });

  it('accepts partial withdrawal only when enabled', async () => {
    expect((await setup().handler(post(validBody({ items: ['Shoes'] })))).status).toBe(400);
    const response = await setup({ allowPartial: true }).handler(post(validBody({ items: ['Shoes'] })));
    expect(response.status).toBe(201);
  });
});

describe('withdrawal handler: idempotency', () => {
  it('returns the same receipt for the same submission and stores it once', async () => {
    const { handler, store, notifier } = setup();
    const first = await json(await handler(post()));
    const secondResponse = await handler(post());
    expect(secondResponse.status).toBe(200);
    const second = await json(secondResponse);
    expect(second).toEqual(first);
    expect(store.list()).toHaveLength(1);
    expect(notifier.sent).toHaveLength(1);
  });

  it('keeps the original submission time on replay', async () => {
    let now = new Date('2026-06-19T08:30:00.000Z');
    const { handler } = setup({ now: () => now });
    await handler(post());
    now = new Date('2026-07-30T08:30:00.000Z');
    const replay = await json(await handler(post()));
    expect((replay['submittedAt'] as Record<string, string>)['utc']).toBe('2026-06-19T08:30:00.000Z');
  });

  it('refuses the same key with different content (409)', async () => {
    const { handler, store } = setup();
    await handler(post());
    const response = await handler(post(validBody({ contract: 'ORDER-9999' })));
    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ error: 'idempotency_conflict' });
    expect(store.list()).toHaveLength(1);
  });

  it('treats a new key as a new statement', async () => {
    const { handler, store } = setup();
    await handler(post());
    expect((await handler(post(validBody({ idempotencyKey: 'k_another_key_12345' })))).status).toBe(201);
    expect(store.list()).toHaveLength(2);
  });

  it('keeps the record and reports pending when the notifier fails, then sends on retry', async () => {
    const { handler, store, notifier, errors } = setup();
    notifier.failNext = 1;
    const first = await handler(post());
    expect(first.status).toBe(201);
    expect((await json(first))['acknowledgement']).toBe('pending');
    expect(store.list()[0]?.acknowledgedAt).toBeUndefined();
    expect(errors.map(([phase]) => phase)).toEqual(['notify']);
    const retry = await handler(post());
    expect(retry.status).toBe(200);
    expect((await json(retry))['acknowledgement']).toBe('sent');
    expect(notifier.sent).toHaveLength(1);
    expect(store.list()[0]?.acknowledgedAt).toBeDefined();
  });

  it('handles a concurrent insert race by replaying the stored record', async () => {
    const base = setup();
    const racing: WithdrawalStore = {
      get: () => Promise.resolve(undefined),
      insert: (record) => base.store.insert(record),
      markAcknowledged: (key, at) => base.store.markAcknowledged(key, at),
    };
    const { handler } = setup({ store: racing });
    expect((await handler(post())).status).toBe(201);
    expect((await handler(post())).status).toBe(200);
  });
});

describe('withdrawal handler: recipient limit', () => {
  it('records every withdrawal but sends at most 5 e-mails per address and hour by default', async () => {
    const { handler, store, notifier } = setup({ rateLimiter: false });
    const states: unknown[] = [];
    for (let i = 0; i < 7; i += 1) {
      const response = await handler(post(validBody({ idempotencyKey: `k_recipient_key_${String(i)}` })));
      expect(response.status).toBe(201);
      states.push((await json(response))['acknowledgement']);
    }
    expect(states).toEqual(['sent', 'sent', 'sent', 'sent', 'sent', 'pending', 'pending']);
    expect(store.list()).toHaveLength(7);
    expect(notifier.sent).toHaveLength(5);
  });

  it('counts addresses case-insensitively and can be switched off', async () => {
    const limited = setup({ rateLimiter: false, recipientRateLimiter: new MemoryRateLimiter({ limit: 1 }) });
    await limited.handler(post(validBody({ idempotencyKey: 'k_case_key_000001', email: 'Jane@example.eu' })));
    await limited.handler(post(validBody({ idempotencyKey: 'k_case_key_000002', email: 'jane@example.eu' })));
    expect(limited.notifier.sent).toHaveLength(1);
    const open = setup({ rateLimiter: false, recipientRateLimiter: false });
    for (let i = 0; i < 7; i += 1) await open.handler(post(validBody({ idempotencyKey: `k_open_recipient_${String(i)}` })));
    expect(open.notifier.sent).toHaveLength(7);
  });
});

describe('withdrawal handler: refusals', () => {
  it('allows POST only (405 with Allow)', async () => {
    const { handler } = setup();
    for (const method of ['GET', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
      const response = await handler(new Request(ENDPOINT, { method, headers: { Origin: ORIGIN } }));
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('POST');
    }
  });

  describe('CSRF origin check', () => {
    it('refuses a foreign origin', async () => {
      const { handler, store } = setup();
      const response = await handler(post(validBody(), { Origin: 'https://evil.example' }));
      expect(response.status).toBe(403);
      expect(await json(response)).toEqual({ error: 'forbidden_origin' });
      expect(store.list()).toHaveLength(0);
    });

    it('refuses a look-alike origin and the null origin', async () => {
      const { handler } = setup();
      for (const origin of ['https://shop.example.evil.example', 'http://shop.example', 'https://shop.example:8443', 'null']) {
        expect((await handler(post(validBody(), { Origin: origin }))).status).toBe(403);
      }
    });

    it('refuses a missing origin unless Sec-Fetch-Site is same-origin', async () => {
      const { handler } = setup();
      const noOrigin = (headers: Record<string, string>) =>
        new Request(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(validBody()) });
      expect((await handler(noOrigin({}))).status).toBe(403);
      expect((await handler(noOrigin({ 'Sec-Fetch-Site': 'cross-site' }))).status).toBe(403);
      expect((await handler(noOrigin({ 'Sec-Fetch-Site': 'same-site' }))).status).toBe(403);
      expect((await handler(noOrigin({ 'Sec-Fetch-Site': 'same-origin' }))).status).toBe(201);
    });

    it('accepts a missing origin when explicitly allowed', async () => {
      const { handler } = setup({ allowMissingOrigin: true });
      const request = new Request(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(validBody()) });
      expect((await handler(request)).status).toBe(201);
    });

    it('matches origins case-insensitively after normalising the configuration', async () => {
      const { handler } = setup({ allowedOrigins: ['HTTPS://Shop.Example:443/'] });
      expect((await handler(post(validBody(), { Origin: 'https://shop.example' }))).status).toBe(201);
    });
  });

  it.each([
    [undefined],
    ['text/plain'],
    ['application/x-www-form-urlencoded'],
    ['multipart/form-data; boundary=x'],
    ['application/json; charset=latin1'],
    ['application/json; foo=bar'],
    ['application/jsonp'],
  ])('refuses content type %s (415)', async (contentType) => {
    const { handler } = setup();
    const headers: Record<string, string> = { Origin: ORIGIN };
    if (contentType !== undefined) headers['Content-Type'] = contentType;
    const response = await handler(new Request(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(validBody()) }));
    expect(response.status).toBe(415);
  });

  it('refuses a body over the limit (413), declared or streamed', async () => {
    const { handler, store } = setup({ maxBodyBytes: 2048 });
    const big = JSON.stringify(validBody({ name: 'x'.repeat(4000) }));
    expect((await handler(post(big))).status).toBe(413);
    const streamed = new Request(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          for (let i = 0; i < 10; i += 1) controller.enqueue(new Uint8Array(1000).fill(32));
          controller.close();
        },
      }),
      duplex: 'half',
    } as RequestInit);
    expect((await handler(streamed)).status).toBe(413);
    expect(store.list()).toHaveLength(0);
  });

  it('answers 400, not 500, for deeply nested JSON', async () => {
    const { handler } = setup();
    const response = await handler(post('['.repeat(15000) + ']'.repeat(1000)));
    expect(response.status).toBe(400);
    const deep = await handler(post('{"name":' + '['.repeat(7000) + ']'.repeat(7000) + '}'));
    expect(deep.status).toBe(400);
  });

  it('refuses malformed JSON and invalid UTF-8 (400)', async () => {
    const { handler } = setup();
    expect(await json(await handler(post('{"name":')))).toEqual({ error: 'invalid_json' });
    const bad = new Request(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]),
    });
    const response = await handler(bad);
    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ error: 'invalid_encoding' });
  });

  it('returns field errors without echoing input (400)', async () => {
    const { handler } = setup();
    const response = await handler(post(validBody({ email: '<script>x</script>', name: '' })));
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).not.toContain('<script>');
    expect(JSON.parse(text)).toEqual({
      error: 'validation_failed',
      errors: [
        { field: 'name', code: 'required' },
        { field: 'email', code: 'invalid_email' },
      ],
    });
  });

  it('rate-limits per client address (429 with Retry-After)', async () => {
    let t = 0;
    const { handler } = setup({ rateLimiter: new MemoryRateLimiter({ limit: 2, windowMs: 60_000, now: () => t }) });
    const statuses: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      statuses.push((await handler(post(validBody({ idempotencyKey: `k_rate_limit_key_${String(i)}` })), { clientAddress: '203.0.113.9' })).status);
    }
    expect(statuses).toEqual([201, 201, 429]);
    const limited = await handler(post(), { clientAddress: '203.0.113.9' });
    expect(limited.headers.get('retry-after')).toBe('60');
    expect(await json(limited)).toEqual({ error: 'rate_limited' });
    expect((await handler(post(), { clientAddress: '198.51.100.1' })).status).toBe(201);
    t = 60_000;
    expect((await handler(post(validBody({ idempotencyKey: 'k_after_window_123' })), { clientAddress: '203.0.113.9' })).status).toBe(201);
  });

  it('rate-limits before reading the body', async () => {
    let read = false;
    const { handler } = setup({ rateLimiter: { consume: () => ({ allowed: false }) } });
    const request = new Request(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            read = true;
            controller.close();
          },
        },
        { highWaterMark: 0 },
      ),
      duplex: 'half',
    } as RequestInit);
    const response = await handler(request);
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(read).toBe(false);
  });

  it('can run without the built-in rate limiter', async () => {
    const { handler } = setup({ rateLimiter: false, recipientRateLimiter: false });
    for (let i = 0; i < 15; i += 1) {
      expect((await handler(post(validBody({ idempotencyKey: `k_no_limit_key_${String(i)}` })))).status).toBe(201);
    }
  });

  it('applies a default rate limiter of 10 per minute', async () => {
    const { handler } = setup();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      statuses.push((await handler(post(validBody({ idempotencyKey: `k_default_limit_${String(i)}` })), { clientAddress: '192.0.2.5' })).status);
    }
    expect(statuses.filter((s) => s === 429)).toHaveLength(1);
  });

  it('answers 500 without internals when the store fails', async () => {
    const failing: WithdrawalStore = {
      get: () => Promise.reject(new Error('ECONNREFUSED 10.0.0.5:5432 password=hunter2')),
      insert: () => Promise.reject(new Error('x')),
      markAcknowledged: () => Promise.resolve(),
    };
    const { handler, errors } = setup({ store: failing });
    const response = await handler(post());
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toBe('{"error":"internal_error"}');
    expect(errors.map(([phase]) => phase)).toEqual(['store']);
  });

  it('survives a throwing onError and a failing markAcknowledged', async () => {
    const store: WithdrawalStore = {
      get: () => Promise.resolve(undefined),
      insert: () => Promise.resolve({ inserted: true }),
      markAcknowledged: () => Promise.reject(new Error('disk full')),
    };
    const { handler } = setup({
      store,
      onError: () => {
        throw new Error('logger down');
      },
    });
    expect((await handler(post())).status).toBe(201);
  });

  it('logs only the error name by default', async () => {
    const lines: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      lines.push(args);
    };
    try {
      const handler = createWithdrawalHandler({
        secret: SECRET,
        trader: { name: 'Shop', timeZone: 'UTC' },
        allowedOrigins: [ORIGIN],
        store: { get: () => Promise.reject(new Error('jane@example.eu secret')), insert: () => Promise.reject(new Error('x')), markAcknowledged: () => Promise.resolve() },
        notifier: new RecordingNotifier(),
      });
      await handler(post());
      await createWithdrawalHandler({
        secret: SECRET,
        trader: { name: 'Shop', timeZone: 'UTC' },
        allowedOrigins: [ORIGIN],
        store: { get: () => Promise.reject(new Error('x')), insert: () => Promise.reject(new Error('x')), markAcknowledged: () => Promise.resolve() },
        notifier: new RecordingNotifier(),
        rateLimiter: { consume: () => ({ then: (_ok: unknown, fail: (reason: unknown) => void) => { fail('not an error'); } }) as unknown as Promise<RateLimitResult> },
      })(post());
    } finally {
      console.error = original;
    }
    expect(lines).toEqual([['[cooloff] store error: Error'], ['[cooloff] internal error: string']]);
  });
});

describe('withdrawal handler: configuration', () => {
  const base = {
    secret: SECRET,
    trader: { name: 'Shop', timeZone: 'UTC' },
    allowedOrigins: [ORIGIN],
    store: setup().store,
    notifier: new RecordingNotifier(),
  };
  it.each([
    ['short secret', { secret: 'short' }],
    ['empty trader name', { trader: { name: ' ', timeZone: 'UTC' } }],
    ['bad time zone', { trader: { name: 'Shop', timeZone: 'Nowhere/Nope' } }],
    ['no origins', { allowedOrigins: [] }],
    ['wildcard origin', { allowedOrigins: ['*'] }],
    ['origin with path', { allowedOrigins: ['https://shop.example/path'] }],
    ['origin with credentials', { allowedOrigins: ['https://user:pw@shop.example'] }],
    ['non-http origin', { allowedOrigins: ['ftp://shop.example'] }],
    ['body limit too small', { maxBodyBytes: 10 }],
    ['body limit too large', { maxBodyBytes: 10 * 1024 * 1024 }],
    ['body limit not integer', { maxBodyBytes: 2048.5 }],
  ])('refuses %s', (_name, override) => {
    expect(() => createWithdrawalHandler({ ...base, ...override })).toThrow();
  });
});

describe('http helpers', () => {
  it('normalises origins', () => {
    expect(normaliseOrigin('https://Shop.Example:443')).toBe('https://shop.example');
    expect(normaliseOrigin('http://localhost:3000/')).toBe('http://localhost:3000');
    expect(() => normaliseOrigin('not a url')).toThrow(TypeError);
    expect(() => normaliseOrigin('https://shop.example/?q=1')).toThrow(TypeError);
  });

  it('checks content types', () => {
    expect(isJsonContentType('application/json')).toBe(true);
    expect(isJsonContentType('Application/JSON; Charset="UTF-8"')).toBe(true);
    expect(isJsonContentType('application/json;')).toBe(true);
    expect(isJsonContentType('application/json; charset=utf8')).toBe(true);
    expect(isJsonContentType(null)).toBe(false);
    expect(isJsonContentType(`application/json; ${'x'.repeat(200)}`)).toBe(false);
  });

  it('checkOrigin treats Sec-Fetch-Site none like a missing origin', () => {
    const allowed = new Set([ORIGIN]);
    expect(checkOrigin(new Headers({ 'Sec-Fetch-Site': 'none' }), allowed).ok).toBe(false);
    expect(checkOrigin(new Headers({ 'Sec-Fetch-Site': 'none' }), allowed, true).ok).toBe(true);
  });

  it('readBodyWithLimit refuses a bogus Content-Length and reads empty bodies', async () => {
    const bogus = { headers: new Headers({ 'content-length': '-1' }), body: null } as unknown as Request;
    await expect(readBodyWithLimit(bogus, 100)).rejects.toThrow('too large');
    const empty = { headers: new Headers(), body: null } as unknown as Request;
    expect(await readBodyWithLimit(empty, 100)).toBe('');
  });
});
