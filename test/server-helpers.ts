import type { RenderedEmail } from '../src/core/email.js';
import { createWithdrawalHandler, type WithdrawalHandlerOptions } from '../src/server/handler.js';
import { MemoryStore } from '../src/server/memory-store.js';
import type { Notifier } from '../src/server/types.js';
import { SECRET, validBody } from './fixtures.js';

export const ORIGIN = 'https://shop.example';
export const ENDPOINT = `${ORIGIN}/api/withdrawal`;

export class RecordingNotifier implements Notifier {
  readonly sent: RenderedEmail[] = [];
  failNext = 0;
  send(email: RenderedEmail): Promise<void> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      return Promise.reject(new Error('smtp down'));
    }
    this.sent.push(email);
    return Promise.resolve();
  }
}

export function setup(overrides: Partial<WithdrawalHandlerOptions> = {}) {
  const store = new MemoryStore();
  const notifier = new RecordingNotifier();
  const errors: Array<[string, unknown]> = [];
  const handler = createWithdrawalHandler({
    secret: SECRET,
    trader: { name: 'Example Shop', timeZone: 'Europe/Vilnius' },
    allowedOrigins: [ORIGIN],
    store,
    notifier,
    now: () => new Date('2026-06-19T08:30:00.000Z'),
    onError: (phase, error) => {
      errors.push([phase, error]);
    },
    ...overrides,
  });
  return { handler, store, notifier, errors };
}

export function post(body: unknown = validBody(), headers: Record<string, string> = {}): Request {
  return new Request(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
