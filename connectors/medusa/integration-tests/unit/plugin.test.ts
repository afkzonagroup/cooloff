import { getWithdrawalCoreHandler, getWithdrawalHandler, originsFromStoreCors } from '../../src/lib/handler';
import retryJob, { config as retryJobConfig } from '../../src/jobs/retry-acknowledgements';
import { MedusaWithdrawalStore } from '../../src/lib/medusa-store';
import { optionProblems } from '../../src/modules/cooloff/loaders/validate-options';
import type CooloffModuleService from '../../src/modules/cooloff/service';

const SECRET = { COOLOFF_SECRET: 'x'.repeat(32) };

describe('optionProblems', () => {
  it('accepts a complete configuration', () => {
    expect(optionProblems({ traderName: 'Shop', timeZone: 'Europe/Vilnius' }, SECRET)).toEqual([]);
  });

  it('reports every problem', () => {
    expect(optionProblems({ timeZone: 'Mars/Base', rateLimitPerMinute: 0 }, { COOLOFF_SECRET: 'short' })).toEqual([
      'traderName is required',
      'timeZone must be an IANA time zone such as Europe/Vilnius',
      'the COOLOFF_SECRET environment variable must hold at least 32 bytes',
      'rateLimitPerMinute must be a positive integer',
    ]);
    expect(optionProblems(undefined, {})).toHaveLength(3);
  });

  it('checks allowedOrigins', () => {
    const base = { traderName: 'Shop', timeZone: 'Europe/Vilnius' };
    expect(optionProblems({ ...base, allowedOrigins: ['https://shop.example', 'http://localhost:8000/'] }, SECRET)).toEqual([]);
    expect(optionProblems({ ...base, allowedOrigins: [] }, SECRET)).toEqual(['allowedOrigins must list at least one origin']);
    expect(optionProblems({ ...base, allowedOrigins: ['shop.example', 'https://x.example/path'] }, SECRET)).toEqual([
      'allowedOrigins: shop.example is not an origin such as https://shop.example',
      'allowedOrigins: https://x.example/path is not an origin such as https://shop.example',
    ]);
  });
});

describe('originsFromStoreCors', () => {
  it('keeps plain origins and drops regexes and paths', () => {
    expect(originsFromStoreCors('https://shop.example, http://localhost:8000,/.*\\.example$/,https://x.example/path')).toEqual([
      'https://shop.example',
      'http://localhost:8000',
    ]);
    expect(originsFromStoreCors(undefined)).toEqual([]);
    expect(originsFromStoreCors('http://localhost:8000/, https://Shop.example:443')).toEqual(['http://localhost:8000', 'https://shop.example']);
  });
});

describe('MedusaWithdrawalStore', () => {
  type Row = Record<string, unknown>;
  function fakeService(rows: Row[], failCreate = false) {
    return {
      listWithdrawals: (filter: { storage_key: string }) => Promise.resolve(rows.filter((r) => r['storage_key'] === filter.storage_key)),
      createWithdrawals: (data: Row) => {
        if (failCreate || rows.some((r) => r['storage_key'] === data['storage_key'])) return Promise.reject(new Error('duplicate key'));
        rows.push({ id: `wdr_${String(rows.length)}`, acknowledged_at: null, ...data });
        return Promise.resolve(data);
      },
      updateWithdrawals: (data: Row) => {
        const row = rows.find((r) => r['id'] === data['id']);
        if (row) Object.assign(row, data);
        return Promise.resolve(row);
      },
    } as unknown as CooloffModuleService;
  }
  const record = {
    receiptId: 'WD-1',
    storageKey: 'k1',
    statement: { name: 'Jane', contract: '1', email: 'jane@example.eu', items: ['Shoes'], language: 'en' as const },
    submittedAt: '2026-06-19T08:30:00.000Z',
  };

  it('inserts, finds, links the order and marks the acknowledgement', async () => {
    const rows: Row[] = [];
    const store = new MedusaWithdrawalStore(fakeService(rows), () => Promise.resolve('order_1'));
    expect(await store.insert(record)).toEqual({ inserted: true });
    expect(rows[0]?.['order_id']).toBe('order_1');
    expect(await store.get('k1')).toEqual(record);
    await store.markAcknowledged('k1', '2026-06-19T08:31:00.000Z');
    expect((await store.get('k1'))?.acknowledgedAt).toBe('2026-06-19T08:31:00.000Z');
    expect(await store.ids('k1')).toEqual({ id: 'wdr_0', orderId: 'order_1' });
    expect(await store.get('missing')).toBeUndefined();
    await store.markAcknowledged('missing', 'x');
  });

  it('answers a duplicate insert with the stored record', async () => {
    const rows: Row[] = [];
    const store = new MedusaWithdrawalStore(fakeService(rows));
    await store.insert(record);
    const again = await store.insert({ ...record, receiptId: 'WD-2' });
    expect(again.inserted).toBe(false);
  });

  it('rethrows other insert failures', async () => {
    const store = new MedusaWithdrawalStore(fakeService([], true));
    await expect(store.insert(record)).rejects.toThrow('duplicate key');
  });

  it('drops non-string items read back from the database', async () => {
    const rows: Row[] = [{ id: 'wdr_9', receipt_id: 'WD-9', storage_key: 'k9', name: 'a', contract: 'b', email: 'c@d.eu', items: ['x', 5, null], language: 'en', submitted_at: 't', acknowledged_at: null, order_id: null }];
    const store = new MedusaWithdrawalStore(fakeService(rows));
    expect((await store.get('k9'))?.statement.items).toEqual(['x']);
  });
});

describe('handler wiring', () => {
  type Row = Record<string, unknown>;
  const rows: Row[] = [];
  const notifications: Array<Record<string, unknown>> = [];
  let failNotifications = false;
  const service = {
    getOptions: () => ({ traderName: 'Shop', timeZone: 'Europe/Vilnius', allowedOrigins: ['https://shop.example'] }),
    listWithdrawals: (filter: Record<string, unknown>, config: { take?: number }) => {
      let found = rows;
      if (typeof filter['storage_key'] === 'string') found = rows.filter((r) => r['storage_key'] === filter['storage_key']);
      if ('acknowledged_at' in filter) {
        const since = (filter['submitted_at'] as { $gte: string }).$gte;
        found = rows.filter((r) => r['acknowledged_at'] === null && String(r['submitted_at']) >= since);
      }
      return Promise.resolve(found.slice(0, config.take ?? 100));
    },
    createWithdrawals: (data: Row) => {
      rows.push({ id: `wdr_${String(rows.length)}`, acknowledged_at: null, ...data });
      return Promise.resolve(data);
    },
    updateWithdrawals: (data: Row) => {
      const row = rows.find((r) => r['id'] === data['id']);
      if (row) Object.assign(row, data);
      return Promise.resolve(row);
    },
  };
  const errors: string[] = [];
  const registry: Record<string, unknown> = {
    cooloff: service,
    configModule: { projectConfig: { http: { storeCors: 'https://shop.example' } } },
    logger: { error: (message: string) => errors.push(message) },
    query: { graph: () => Promise.resolve({ data: [] }) },
    notification: {
      createNotifications: (input: Record<string, unknown>) => {
        if (failNotifications) return Promise.reject(new Error('provider down'));
        notifications.push(input);
        return Promise.resolve(input);
      },
    },
    event_bus: { emit: () => Promise.resolve() },
  };
  // A new object per call, like Medusa's per-request req.scope.
  const scope = () => ({ resolve: (key: string) => registry[key] }) as never;

  beforeAll(() => {
    process.env['COOLOFF_SECRET'] = 'x'.repeat(32);
  });

  const request = (i: number) =>
    new Request('https://api.shop.example/store/cooloff/withdrawals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://shop.example' },
      body: JSON.stringify({ name: 'Jane', contract: '1', email: `jane${String(i)}@example.eu`, idempotencyKey: `k_medusa_unit_${String(i).padStart(4, '0')}` }),
    });

  it('builds one handler per application, not per request scope', () => {
    expect(getWithdrawalHandler(scope())).toBe(getWithdrawalHandler(scope()));
    expect(getWithdrawalCoreHandler(scope())).toBe(getWithdrawalCoreHandler(scope()));
  });

  it('keeps the rate limit across request scopes', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      statuses.push((await getWithdrawalCoreHandler(scope())(request(i), { clientAddress: '203.0.113.50' })).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('retries pending acknowledgements from the scheduled job', async () => {
    failNotifications = true;
    const response = await getWithdrawalCoreHandler(scope())(request(100), { clientAddress: '203.0.113.51' });
    expect(((await response.json()) as { acknowledgement: string }).acknowledgement).toBe('pending');
    failNotifications = false;
    const before = notifications.length;
    await retryJob(scope());
    expect(notifications.length).toBe(before + 1);
    expect(notifications.at(-1)?.['to']).toBe('jane100@example.eu');
    expect(rows.find((r) => r['email'] === 'jane100@example.eu')?.['acknowledged_at']).not.toBeNull();
    expect(retryJobConfig.schedule).toBe('*/15 * * * *');
  });

  it('logs only the error name when the job fails', async () => {
    const broken = { resolve: (key: string) => (key === 'cooloff' ? { ...service, listWithdrawals: () => Promise.reject(new Error('db down jane@example.eu')) } : registry[key]) } as never;
    await retryJob(broken);
    expect(errors.some((e) => e.includes('jane@example.eu'))).toBe(false);
    expect(errors.some((e) => e.startsWith('[cooloff]'))).toBe(true);
  });
});
