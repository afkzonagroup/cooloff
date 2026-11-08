import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createExpressMiddleware } from '../src/server/express.js';
import { FileStore } from '../src/server/file-store.js';
import { recipientLimitKey } from '../src/server/handler.js';
import { MemoryStore } from '../src/server/memory-store.js';
import { createNextRouteHandlers } from '../src/server/next.js';
import { createNodeHandler } from '../src/server/node.js';
import { clientRateLimitKey, MemoryRateLimiter } from '../src/server/rate-limit.js';
import type { StoredWithdrawal, WithdrawalStore } from '../src/server/types.js';
import { SECRET, validBody } from './fixtures.js';
import { ORIGIN, post, RecordingNotifier, setup } from './server-helpers.js';

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

const key = (i: number): Record<string, unknown> => validBody({ idempotencyKey: `k_hardening_key_${String(i).padStart(3, '0')}` });

describe('clientRateLimitKey', () => {
  it('reduces IPv6 addresses to their /64 network', () => {
    expect(clientRateLimitKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::/64');
    expect(clientRateLimitKey('2001:DB8:1:2::1')).toBe('2001:db8:1:2::/64');
    expect(clientRateLimitKey('[2001:db8:1:2::1]')).toBe('2001:db8:1:2::/64');
    expect(clientRateLimitKey('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
    expect(clientRateLimitKey('::1')).toBe('0:0:0:0::/64');
    expect(clientRateLimitKey('2001:db8::')).toBe('2001:db8:0:0::/64');
    expect(clientRateLimitKey('64:ff9b::192.0.2.1')).toBe('64:ff9b:0:0::/64');
  });

  it('maps IPv4-mapped IPv6 addresses to IPv4', () => {
    expect(clientRateLimitKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(clientRateLimitKey('::FFFF:cb00:7107')).toBe('203.0.113.7');
  });

  it('keeps IPv4, custom keys and unparsable input, and names a missing address', () => {
    expect(clientRateLimitKey('203.0.113.7')).toBe('203.0.113.7');
    expect(clientRateLimitKey('tenant-1')).toBe('tenant-1');
    expect(clientRateLimitKey('1:2:3')).toBe('1:2:3');
    expect(clientRateLimitKey('1::2::3')).toBe('1::2::3');
    expect(clientRateLimitKey('::ffff:300.1.1.1')).toBe('::ffff:300.1.1.1');
    expect(clientRateLimitKey('x'.repeat(500)).length).toBe(100);
    expect(clientRateLimitKey(undefined)).toBe('unknown');
    expect(clientRateLimitKey('  ')).toBe('unknown');
  });

  it('makes the handler limit a whole IPv6 /64 as one client', async () => {
    const { handler } = setup({ rateLimiter: new MemoryRateLimiter({ limit: 1 }) });
    expect((await handler(post(key(1)), { clientAddress: '2001:db8:1:2::1' })).status).toBe(201);
    expect((await handler(post(key(2)), { clientAddress: '2001:db8:1:2::2' })).status).toBe(429);
    expect((await handler(post(key(3)), { clientAddress: '2001:db8:1:3::1' })).status).toBe(201);
    expect((await handler(post(key(4)), { clientAddress: '198.51.100.4' })).status).toBe(201);
    expect((await handler(post(key(5)), { clientAddress: '::ffff:198.51.100.4' })).status).toBe(429);
  });
});

describe('recipient limit key', () => {
  it('ignores case and sub-address tags', () => {
    expect(recipientLimitKey('Jane+Promo@Example.EU')).toBe('jane@example.eu');
    expect(recipientLimitKey('jane@example.eu')).toBe('jane@example.eu');
    expect(recipientLimitKey('+tag@example.eu')).toBe('+tag@example.eu');
    expect(recipientLimitKey('no-at-sign')).toBe('no-at-sign');
  });

  it('cannot be multiplied with plus tags', async () => {
    const { handler, notifier, store } = setup({ rateLimiter: false, recipientRateLimiter: new MemoryRateLimiter({ limit: 2 }) });
    for (let i = 0; i < 4; i += 1) {
      await handler(post(validBody({ idempotencyKey: `k_plus_tag_key_${String(i)}x`, email: `jane+${String(i)}@example.eu` })));
    }
    expect(store.list()).toHaveLength(4);
    expect(notifier.sent).toHaveLength(2);
  });
});

describe('retryPendingAcknowledgements', () => {
  it('sends acknowledgements the notifier failed to send, once', async () => {
    const { handler, notifier, store } = setup();
    notifier.failNext = 1;
    expect((await json(await handler(post())))['acknowledgement']).toBe('pending');
    expect(await handler.retryPendingAcknowledgements()).toEqual({ sent: 1, pending: 0 });
    expect(notifier.sent).toHaveLength(1);
    expect(notifier.sent[0]?.to).toBe('jane@example.eu');
    expect(store.list()[0]?.acknowledgedAt).toBeDefined();
    expect(await handler.retryPendingAcknowledgements()).toEqual({ sent: 0, pending: 0 });
    expect(notifier.sent).toHaveLength(1);
  });

  it('keeps failing ones pending and reports them', async () => {
    const { handler, notifier, errors } = setup();
    notifier.failNext = 2;
    await handler(post());
    expect(await handler.retryPendingAcknowledgements()).toEqual({ sent: 0, pending: 1 });
    expect(errors.map(([phase]) => phase)).toEqual(['notify', 'notify']);
  });

  it('applies the recipient limit and sends held-back e-mails later', async () => {
    let t = 0;
    const recipientRateLimiter = new MemoryRateLimiter({ limit: 1, windowMs: 3_600_000, now: () => t });
    const { handler, notifier } = setup({ rateLimiter: false, recipientRateLimiter });
    await handler(post(key(1)));
    expect((await json(await handler(post(key(2)))))['acknowledgement']).toBe('pending');
    expect(await handler.retryPendingAcknowledgements()).toEqual({ sent: 0, pending: 1 });
    t = 3_600_000;
    expect(await handler.retryPendingAcknowledgements()).toEqual({ sent: 1, pending: 0 });
    expect(notifier.sent).toHaveLength(2);
  });

  it('only looks at recent records and respects the limit', async () => {
    let now = new Date('2026-06-19T08:30:00.000Z');
    const { handler, notifier } = setup({ now: () => now, recipientRateLimiter: false, rateLimiter: false });
    notifier.failNext = 3;
    for (let i = 0; i < 3; i += 1) await handler(post(key(i)));
    now = new Date('2026-06-22T08:30:00.001Z');
    expect(await handler.retryPendingAcknowledgements()).toEqual({ sent: 0, pending: 0 });
    expect(await handler.retryPendingAcknowledgements({ maxAgeHours: 73, limit: 2 })).toEqual({ sent: 2, pending: 0 });
    expect(await handler.retryPendingAcknowledgements({ maxAgeHours: 73 })).toEqual({ sent: 1, pending: 0 });
  });

  it('refuses bad options and stores without listUnacknowledged', async () => {
    const { handler } = setup();
    await expect(handler.retryPendingAcknowledgements({ maxAgeHours: 0 })).rejects.toThrow(RangeError);
    await expect(handler.retryPendingAcknowledgements({ maxAgeHours: 721 })).rejects.toThrow(RangeError);
    await expect(handler.retryPendingAcknowledgements({ limit: 0 })).rejects.toThrow(RangeError);
    await expect(handler.retryPendingAcknowledgements({ limit: 1.5 })).rejects.toThrow(RangeError);
    const base = new MemoryStore();
    const bare: WithdrawalStore = {
      get: (k) => base.get(k),
      insert: (r) => base.insert(r),
      markAcknowledged: (k, at) => base.markAcknowledged(k, at),
    };
    await expect(setup({ store: bare }).handler.retryPendingAcknowledgements()).rejects.toThrow(TypeError);
  });

  it('reports and rethrows a store failure, and skips records that are already acknowledged', async () => {
    const failing = setup({
      store: Object.assign(new MemoryStore(), { listUnacknowledged: () => Promise.reject(new Error('db down')) }),
    });
    await expect(failing.handler.retryPendingAcknowledgements()).rejects.toThrow('db down');
    expect(failing.errors.map(([phase]) => phase)).toEqual(['store']);

    const done: StoredWithdrawal = {
      receiptId: 'WD-X',
      storageKey: 'k',
      statement: { name: 'Jane', contract: '1', email: 'jane@example.eu', items: [], language: 'en' },
      submittedAt: '2026-06-19T08:00:00.000Z',
      acknowledgedAt: '2026-06-19T08:00:01.000Z',
    };
    const stale = setup({ store: Object.assign(new MemoryStore(), { listUnacknowledged: () => Promise.resolve([done]) }) });
    expect(await stale.handler.retryPendingAcknowledgements()).toEqual({ sent: 0, pending: 0 });
  });
});

describe('FileStore.listUnacknowledged', () => {
  let dir = '';
  afterEach(async () => {
    if (dir !== '') await rm(dir, { recursive: true, force: true });
    dir = '';
  });

  it('lists pending records after a reload, oldest first', async () => {
    dir = await mkdtemp(join(tmpdir(), 'cooloff-retry-'));
    const make = (k: string, at: string): StoredWithdrawal => ({
      receiptId: `WD-${k}`,
      storageKey: k,
      statement: { name: 'Jane', contract: '1', email: 'jane@example.eu', items: [], language: 'en' },
      submittedAt: at,
    });
    const first = new FileStore({ directory: dir, fsync: false });
    await first.insert(make('b', '2026-06-19T09:00:00.000Z'));
    await first.insert(make('a', '2026-06-19T08:00:00.000Z'));
    await first.insert(make('c', '2026-06-18T08:00:00.000Z'));
    await first.markAcknowledged('b', '2026-06-19T09:00:01.000Z');
    const second = new FileStore({ directory: dir });
    expect((await second.listUnacknowledged('2026-06-19T00:00:00.000Z', 10)).map((r) => r.storageKey)).toEqual(['a']);
    expect((await second.listUnacknowledged('2026-06-01T00:00:00.000Z', 1)).map((r) => r.storageKey)).toEqual(['c']);
  });
});

describe('adapters expose the retry', () => {
  const options = () => ({
    secret: SECRET,
    trader: { name: 'Example Shop', timeZone: 'Europe/Vilnius' },
    allowedOrigins: [ORIGIN],
    store: new MemoryStore(),
    notifier: new RecordingNotifier(),
  });

  it('on the Node handler, the Express middleware and the Next route handlers', async () => {
    expect(await createNodeHandler(options()).retryPendingAcknowledgements()).toEqual({ sent: 0, pending: 0 });
    expect(await createExpressMiddleware(options()).retryPendingAcknowledgements()).toEqual({ sent: 0, pending: 0 });
    const next = createNextRouteHandlers({ ...options(), clientAddress: () => '203.0.113.1' });
    expect(await next.retryPendingAcknowledgements()).toEqual({ sent: 0, pending: 0 });
  });

  it('Next needs a client address unless rate limiting is switched off', () => {
    expect(() => createNextRouteHandlers(options())).toThrow(TypeError);
    expect(() => createNextRouteHandlers({ ...options(), rateLimiter: false })).not.toThrow();
  });
});

describe('acknowledgement subject', () => {
  it('never carries line breaks, even from a message override', async () => {
    const { handler, notifier } = setup({
      messages: { en: { emailSubject: 'Receipt {receipt}\r\nBcc: victim@example.eu\u2028X' } },
    });
    await handler(post());
    const subject = notifier.sent[0]?.subject ?? '';
    expect(subject).toMatch(/^Receipt WD-/u);
    expect(subject).not.toMatch(/[\r\n\u2028\u2029]/u);
  });
});
