import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';

import { createExpressMiddleware } from '../src/server/express.js';
import { MemoryStore } from '../src/server/memory-store.js';
import { createNextRouteHandlers, forwardedForAddress } from '../src/server/next.js';
import { createNodeHandler } from '../src/server/node.js';
import { MemoryRateLimiter } from '../src/server/rate-limit.js';
import { SECRET, validBody } from './fixtures.js';
import { ORIGIN, RecordingNotifier } from './server-helpers.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))));
});

function options() {
  return {
    secret: SECRET,
    trader: { name: 'Example Shop', timeZone: 'Europe/Vilnius' },
    allowedOrigins: [ORIGIN],
    store: new MemoryStore(),
    notifier: new RecordingNotifier(),
  };
}

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

function send(base: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  return fetch(`${base}/api/withdrawal`, {
    method: init.method ?? 'POST',
    headers: init.headers ?? { 'Content-Type': 'application/json', Origin: ORIGIN },
    ...(init.body === undefined ? {} : { body: init.body }),
  });
}

/** Sends a raw request with a lying or absent Content-Length using node:http. */
function rawPost(base: string, chunks: string[], headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(`${base}/api/withdrawal`, { method: 'POST', headers }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });
}

describe('Node http adapter', () => {
  it('handles a full submission', async () => {
    const handler = createNodeHandler(options());
    const base = await listen(createServer((req, res) => void handler(req, res)));
    const response = await send(base, { body: JSON.stringify(validBody()) });
    expect(response.status).toBe(201);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(((await response.json()) as { receiptId: string }).receiptId).toMatch(/^WD-/u);
  });

  it('refuses a declared oversize body without reading it', async () => {
    const handler = createNodeHandler({ ...options(), maxBodyBytes: 2048 });
    const base = await listen(createServer((req, res) => void handler(req, res)));
    const response = await send(base, { body: JSON.stringify(validBody({ name: 'x'.repeat(5000) })) });
    expect(response.status).toBe(413);
  });

  it('refuses an oversize chunked body', async () => {
    const handler = createNodeHandler({ ...options(), maxBodyBytes: 2048 });
    const base = await listen(createServer((req, res) => void handler(req, res)));
    const status = await rawPost(base, ['{"name":"', 'x'.repeat(1500), 'x'.repeat(1500), '"}'], {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      'Transfer-Encoding': 'chunked',
    });
    expect(status).toBe(413);
  });

  it('answers 405 for GET without reading a body', async () => {
    const handler = createNodeHandler(options());
    const base = await listen(createServer((req, res) => void handler(req, res)));
    const response = await send(base, { method: 'GET', headers: { Origin: ORIGIN } });
    expect(response.status).toBe(405);
  });

  it('uses the socket address for rate limiting by default', async () => {
    const handler = createNodeHandler({ ...options(), rateLimiter: new MemoryRateLimiter({ limit: 1 }) });
    const base = await listen(createServer((req, res) => void handler(req, res)));
    expect((await send(base, { body: JSON.stringify(validBody()) })).status).toBe(201);
    expect((await send(base, { body: JSON.stringify(validBody()) })).status).toBe(429);
  });

  it('accepts a custom client address function', async () => {
    const seen: Array<string | undefined> = [];
    const handler = createNodeHandler({
      ...options(),
      clientAddress: (req) => {
        const value = req.headers['x-test-client'];
        seen.push(typeof value === 'string' ? value : undefined);
        return typeof value === 'string' ? value : undefined;
      },
    });
    const base = await listen(createServer((req, res) => void handler(req, res)));
    await send(base, { headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'X-Test-Client': 'abc' }, body: JSON.stringify(validBody()) });
    await send(base, { body: JSON.stringify(validBody()) });
    expect(seen).toEqual(['abc', undefined]);
  });

  it('answers 500 if the request stream fails', async () => {
    const handler = createNodeHandler({ ...options(), clientAddress: () => { throw new Error('boom'); } });
    const base = await listen(createServer((req, res) => void handler(req, res)));
    const response = await send(base, { body: JSON.stringify(validBody()) });
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('{"error":"internal_error"}');
  });
});

describe('Express middleware', () => {
  it('handles a full submission using req.ip', async () => {
    const app = express();
    app.post('/api/withdrawal', createExpressMiddleware({ ...options(), rateLimiter: new MemoryRateLimiter({ limit: 1 }) }));
    const base = await listen(createServer(app));
    expect((await send(base, { body: JSON.stringify(validBody()) })).status).toBe(201);
    expect((await send(base, { body: JSON.stringify(validBody()) })).status).toBe(429);
  });

  it('refuses to run after a body parser', async () => {
    const app = express();
    const errors: unknown[] = [];
    app.use(express.json());
    app.post('/api/withdrawal', createExpressMiddleware(options()));
    app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      errors.push(error);
      res.status(500).json({ error: 'internal_error' });
    });
    const base = await listen(createServer(app));
    expect((await send(base, { body: JSON.stringify(validBody()) })).status).toBe(500);
    expect(String(errors[0])).toContain('before body parsers');
  });

  it('enforces the size limit', async () => {
    const app = express();
    app.post('/api/withdrawal', createExpressMiddleware({ ...options(), maxBodyBytes: 2048 }));
    const base = await listen(createServer(app));
    expect((await send(base, { body: JSON.stringify(validBody({ name: 'x'.repeat(5000) })) })).status).toBe(413);
  });
});

describe('Next.js route handlers', () => {
  it('exports a POST handler that works with a standard Request', async () => {
    const { POST } = createNextRouteHandlers({ ...options(), rateLimiter: new MemoryRateLimiter({ limit: 1 }), clientAddress: (r) => forwardedForAddress(r) });
    const make = (xff: string) =>
      new Request(`${ORIGIN}/api/withdrawal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'X-Forwarded-For': xff },
        body: JSON.stringify(validBody()),
      });
    expect((await POST(make('198.51.100.1, 203.0.113.1'))).status).toBe(201);
    expect((await POST(make('198.51.100.2, 203.0.113.1'))).status).toBe(429);
    expect((await POST(make('203.0.113.2'))).status).toBe(200);
  });

  it('works without a client address function when rate limiting is switched off', async () => {
    const { POST } = createNextRouteHandlers({ ...options(), rateLimiter: false });
    const response = await POST(
      new Request(`${ORIGIN}/api/withdrawal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify(validBody()),
      }),
    );
    expect(response.status).toBe(201);
  });

  it('forwardedForAddress picks entries from the right and ignores junk', () => {
    const r = (value?: string) => new Request(ORIGIN, value === undefined ? {} : { headers: { 'X-Forwarded-For': value } });
    expect(forwardedForAddress(r('1.1.1.1, 2.2.2.2'))).toBe('2.2.2.2');
    expect(forwardedForAddress(r('1.1.1.1, 2.2.2.2'), 1)).toBe('1.1.1.1');
    expect(forwardedForAddress(r('1.1.1.1'), 3)).toBeUndefined();
    expect(forwardedForAddress(r())).toBeUndefined();
    expect(forwardedForAddress(r('x'.repeat(2000)))).toBeUndefined();
    expect(forwardedForAddress(r('y'.repeat(100)))).toBeUndefined();
  });
});
