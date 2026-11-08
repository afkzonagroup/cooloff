import { appendFile, chmod, lstat, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FileStore, isTrustedOwner, parseLogLine, resolveStorePath } from '../src/server/file-store.js';
import { MemoryStore } from '../src/server/memory-store.js';
import { MemoryRateLimiter } from '../src/server/rate-limit.js';
import type { StoredWithdrawal } from '../src/server/types.js';

const record = (key: string, overrides: Partial<StoredWithdrawal> = {}): StoredWithdrawal => ({
  receiptId: `WD-${key}`,
  storageKey: key,
  statement: { name: 'Jane Doe', contract: 'ORDER-1', email: 'jane@example.eu', items: [], language: 'en' },
  submittedAt: '2026-06-19T08:30:00.000Z',
  ...overrides,
});

const posix = process.platform !== 'win32';

describe('MemoryStore', () => {
  it('inserts once per key and marks acknowledgements', async () => {
    const store = new MemoryStore();
    expect(await store.insert(record('a'))).toEqual({ inserted: true });
    const again = await store.insert(record('a', { receiptId: 'other' }));
    expect(again.inserted).toBe(false);
    expect(!again.inserted && again.existing.receiptId).toBe('WD-a');
    await store.markAcknowledged('a', '2026-06-19T08:31:00.000Z');
    await store.markAcknowledged('missing', 'x');
    expect((await store.get('a'))?.acknowledgedAt).toBe('2026-06-19T08:31:00.000Z');
    expect(store.list()).toHaveLength(1);
  });
});

describe('FileStore', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cooloff-test-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('appends JSON lines and never rewrites them', async () => {
    const store = new FileStore({ directory: join(dir, 'data') });
    await store.insert(record('a'));
    await store.insert(record('b'));
    await store.markAcknowledged('a', '2026-06-19T08:31:00.000Z');
    const lines = (await readFile(store.path, 'utf8')).trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ v: 1, type: 'withdrawal', record: { storageKey: 'a' } });
    expect(JSON.parse(lines[2] ?? '')).toEqual({ v: 1, type: 'acknowledged', storageKey: 'a', at: '2026-06-19T08:31:00.000Z' });
  });

  it('reloads state from disk', async () => {
    const first = new FileStore({ directory: dir, fsync: false });
    await first.insert(record('a'));
    await first.markAcknowledged('a', '2026-06-19T08:31:00.000Z');
    await first.markAcknowledged('unknown', '2026-06-19T08:31:00.000Z');
    const second = new FileStore({ directory: dir });
    expect((await second.get('a'))?.acknowledgedAt).toBe('2026-06-19T08:31:00.000Z');
    expect((await second.insert(record('a'))).inserted).toBe(false);
    expect(await second.list()).toHaveLength(1);
  });

  it('serialises concurrent inserts of the same key', async () => {
    const store = new FileStore({ directory: dir, fsync: false });
    const results = await Promise.all(Array.from({ length: 20 }, () => store.insert(record('same'))));
    expect(results.filter((r) => r.inserted)).toHaveLength(1);
    expect((await readFile(store.path, 'utf8')).trim().split('\n')).toHaveLength(1);
  });

  it.runIf(posix)('creates the file with mode 0600 and the directory with 0700', async () => {
    const directory = join(dir, 'private');
    const store = new FileStore({ directory });
    await store.insert(record('a'));
    expect((await stat(store.path)).mode & 0o777).toBe(0o600);
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
  });

  it.runIf(posix)('tightens a loose log file but never changes an existing directory', async () => {
    await chmod(dir, 0o755);
    const path = join(dir, 'withdrawals.jsonl');
    await writeFile(path, '', { mode: 0o644 });
    await chmod(path, 0o644);
    const store = new FileStore({ directory: dir });
    await store.insert(record('a'));
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(dir)).mode & 0o777).toBe(0o755);
  });

  it.runIf(posix)('refuses a directory writable by group or others', async () => {
    for (const mode of [0o777, 0o775, 0o1777]) {
      await chmod(dir, mode);
      await expect(new FileStore({ directory: dir }).get('a')).rejects.toThrow('writable by group or others');
    }
    await chmod(dir, 0o700);
  });

  it('trusts only directories owned by this user or root', () => {
    expect(isTrustedOwner(501, 501)).toBe(true);
    expect(isTrustedOwner(0, 501)).toBe(true);
    expect(isTrustedOwner(502, 501)).toBe(false);
    expect(isTrustedOwner(502, undefined)).toBe(true);
  });

  it.runIf(posix)('refuses a symlinked log file', async () => {
    const target = join(dir, 'target.txt');
    await writeFile(target, '');
    await symlink(target, join(dir, 'withdrawals.jsonl'));
    const store = new FileStore({ directory: dir });
    await expect(store.insert(record('a'))).rejects.toThrow();
    expect(await readFile(target, 'utf8')).toBe('');
  });

  it.runIf(posix)('refuses a log file swapped for a symlink after loading', async () => {
    const store = new FileStore({ directory: dir });
    await store.insert(record('a'));
    const target = join(dir, 'target.txt');
    await writeFile(target, '');
    await rm(store.path);
    await symlink(target, store.path);
    await expect(store.insert(record('b'))).rejects.toThrow();
    expect(await readFile(target, 'utf8')).toBe('');
  });

  it.runIf(posix)('refuses a symlinked directory', async () => {
    const real = join(dir, 'real');
    await mkdir(real);
    await symlink(real, join(dir, 'link'));
    const store = new FileStore({ directory: join(dir, 'link') });
    await expect(store.get('a')).rejects.toThrow('not a directory');
  });

  it('refuses a directory in place of the log file', async () => {
    await mkdir(join(dir, 'withdrawals.jsonl'));
    await expect(new FileStore({ directory: dir }).get('a')).rejects.toThrow();
  });

  it('skips malformed lines and repairs a missing final newline', async () => {
    const path = join(dir, 'withdrawals.jsonl');
    const good = JSON.stringify({ v: 1, type: 'withdrawal', record: record('a') });
    await writeFile(path, `${good}\nnot json\n{"v":2}\n${good.slice(0, 20)}`);
    const store = new FileStore({ directory: dir });
    expect(await store.get('a')).toBeDefined();
    expect(store.skippedLines).toBe(3);
    await store.insert(record('b'));
    const reloaded = new FileStore({ directory: dir });
    expect(await reloaded.get('b')).toBeDefined();
  });

  it('keeps the first record when a key appears twice in the file', async () => {
    const path = join(dir, 'withdrawals.jsonl');
    await appendFile(path, JSON.stringify({ v: 1, type: 'withdrawal', record: record('a') }) + '\n');
    await appendFile(path, JSON.stringify({ v: 1, type: 'withdrawal', record: record('a', { receiptId: 'WD-later' }) }) + '\n');
    expect((await new FileStore({ directory: dir }).get('a'))?.receiptId).toBe('WD-a');
  });

  it('does not create files before first use', async () => {
    const directory = join(dir, 'lazy');
    new FileStore({ directory });
    await expect(lstat(directory)).rejects.toThrow();
  });
});

describe('resolveStorePath (path safety)', () => {
  it('accepts plain names', () => {
    expect(resolveStorePath('/var/lib/shop', 'withdrawals.jsonl')).toBe('/var/lib/shop/withdrawals.jsonl');
    expect(resolveStorePath('/var/lib/shop/', 'log-2026_06.jsonl')).toBe('/var/lib/shop/log-2026_06.jsonl');
  });

  it.each([
    '../withdrawals.jsonl',
    '..',
    '.',
    '.hidden',
    'a/b.jsonl',
    'a\\b.jsonl',
    '/etc/passwd',
    'name\0.jsonl',
    'a..b',
    '',
    'x'.repeat(101),
    'with space.jsonl',
    'ünïcode.jsonl',
  ])('refuses file name %j', (fileName) => {
    expect(() => resolveStorePath('/var/lib/shop', fileName)).toThrow(TypeError);
  });

  it('refuses relative directories and NUL bytes', () => {
    expect(() => resolveStorePath('data', 'withdrawals.jsonl')).toThrow(TypeError);
    expect(() => resolveStorePath('/var/lib\0/x', 'withdrawals.jsonl')).toThrow(TypeError);
  });

  it('FileStore refuses unsafe options at construction', () => {
    expect(() => new FileStore({ directory: '/tmp', fileName: '../../etc/cron.d/x' })).toThrow(TypeError);
    expect(() => new FileStore({ directory: 'relative' })).toThrow(TypeError);
  });
});

describe('parseLogLine', () => {
  it.each([
    'null',
    '[]',
    '{"v":1,"type":"withdrawal"}',
    '{"v":1,"type":"withdrawal","record":null}',
    '{"v":1,"type":"withdrawal","record":{"receiptId":1}}',
    '{"v":1,"type":"acknowledged","storageKey":5,"at":"x"}',
    '{"v":1,"type":"other"}',
    JSON.stringify({ v: 1, type: 'withdrawal', record: { ...record('a'), statement: { ...record('a').statement, language: 'xx' } } }),
    JSON.stringify({ v: 1, type: 'withdrawal', record: { ...record('a'), statement: { ...record('a').statement, items: [1] } } }),
    JSON.stringify({ v: 1, type: 'withdrawal', record: { ...record('a'), statement: null } }),
  ])('refuses %s', (line) => {
    expect(parseLogLine(line)).toBeUndefined();
  });

  it('drops unknown properties', () => {
    const line = JSON.stringify({ v: 1, type: 'withdrawal', record: { ...record('a'), extra: 'x', statement: { ...record('a').statement, extra: 'y' } } });
    const parsed = parseLogLine(line);
    expect(parsed?.type === 'withdrawal' && Object.keys(parsed.record).sort()).toEqual(['receiptId', 'statement', 'storageKey', 'submittedAt']);
  });
});

describe('MemoryRateLimiter', () => {
  it('allows the limit per window and reports Retry-After', () => {
    let t = 0;
    const limiter = new MemoryRateLimiter({ limit: 2, windowMs: 10_000, now: () => t });
    expect(limiter.consume('a').allowed).toBe(true);
    expect(limiter.consume('a').allowed).toBe(true);
    expect(limiter.consume('a')).toEqual({ allowed: false, retryAfterSeconds: 10 });
    t = 9_500;
    expect(limiter.consume('a')).toEqual({ allowed: false, retryAfterSeconds: 1 });
    t = 10_000;
    expect(limiter.consume('a').allowed).toBe(true);
  });

  it('caps memory by dropping expired, then oldest keys', () => {
    let t = 0;
    const limiter = new MemoryRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 3, now: () => t });
    limiter.consume('a');
    limiter.consume('b');
    limiter.consume('c');
    expect(limiter.size).toBe(3);
    limiter.consume('d');
    expect(limiter.size).toBe(3);
    expect(limiter.consume('a').allowed).toBe(true);
    t = 5000;
    limiter.consume('e');
    expect(limiter.size).toBe(1);
  });

  it.each([{ limit: 0 }, { windowMs: -1 }, { maxKeys: 1.5 }])('refuses %j', (options) => {
    expect(() => new MemoryRateLimiter(options)).toThrow(RangeError);
  });
});
