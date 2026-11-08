/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import { constants as fsConstants } from 'node:fs';
import { lstat, mkdir, open, readFile, type FileHandle } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { isOfficialLanguage } from '../core/i18n.js';
import type { WithdrawalStatement } from '../core/schema.js';
import type { InsertResult, StoredWithdrawal, WithdrawalStore } from './types.js';
import { unacknowledged } from './unacknowledged.js';

/** Options of {@link FileStore}. */
export interface FileStoreOptions {
  /** Directory for the log file. Created with mode 0700 if missing. Must be absolute. */
  readonly directory: string;
  /** File name inside `directory`. Default `withdrawals.jsonl`. Letters, digits, `.`, `_`, `-` only. */
  readonly fileName?: string;
  /** Call `fsync` after every write. Default `true`. */
  readonly fsync?: boolean;
}

/** `O_NOFOLLOW` where the platform has it (not on Windows). */
const O_NOFOLLOW: number = (fsConstants as Partial<typeof fsConstants>).O_NOFOLLOW ?? 0;

const FILE_NAME = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$/u;

/**
 * Checks a file name for the store and returns the absolute file path.
 * Refuses path separators, `..`, hidden names and anything outside `directory`.
 *
 * @throws TypeError for unsafe input.
 */
export function resolveStorePath(directory: string, fileName: string): string {
  if (!isAbsolute(directory)) throw new TypeError('directory must be an absolute path');
  if (directory.includes('\0')) throw new TypeError('directory must not contain NUL');
  if (!FILE_NAME.test(fileName) || fileName.includes('..')) {
    throw new TypeError('fileName may only contain letters, digits, ".", "_" and "-", and must not start with "."');
  }
  const base = resolve(directory);
  const path = resolve(join(base, fileName));
  const rel = relative(base, path);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new TypeError('fileName resolves outside directory');
  }
  return path;
}

/**
 * `true` if a directory owned by `ownerUid` is safe for a process running as
 * `processUid`: owned by that user or by root. The owner of a directory can
 * replace the files in it. Always `true` where user IDs do not exist (Windows).
 */
export function isTrustedOwner(ownerUid: number, processUid: number | undefined): boolean {
  return processUid === undefined || ownerUid === processUid || ownerUid === 0;
}

type LogLine =
  | { readonly v: 1; readonly type: 'withdrawal'; readonly record: StoredWithdrawal }
  | { readonly v: 1; readonly type: 'acknowledged'; readonly storageKey: string; readonly at: string };

function isString(value: unknown, max = 1000): value is string {
  return typeof value === 'string' && value.length <= max;
}

function parseStatement(value: unknown): WithdrawalStatement | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  const items = v['items'];
  if (
    !isString(v['name']) ||
    !isString(v['contract']) ||
    !isString(v['email']) ||
    !isOfficialLanguage(v['language']) ||
    !Array.isArray(items) ||
    !items.every((item) => isString(item))
  ) {
    return undefined;
  }
  return Object.freeze({
    name: v['name'],
    contract: v['contract'],
    email: v['email'],
    items: Object.freeze([...(items)]),
    language: v['language'],
  });
}

/** Parses one log line. Returns `undefined` for anything malformed. */
export function parseLogLine(line: string): LogLine | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  if (v['v'] !== 1) return undefined;
  if (v['type'] === 'acknowledged') {
    if (!isString(v['storageKey'], 128) || !isString(v['at'], 40)) return undefined;
    return { v: 1, type: 'acknowledged', storageKey: v['storageKey'], at: v['at'] };
  }
  if (v['type'] === 'withdrawal') {
    const r = v['record'];
    if (typeof r !== 'object' || r === null) return undefined;
    const rec = r as Record<string, unknown>;
    const statement = parseStatement(rec['statement']);
    if (
      statement === undefined ||
      !isString(rec['receiptId'], 64) ||
      !isString(rec['storageKey'], 128) ||
      !isString(rec['submittedAt'], 40)
    ) {
      return undefined;
    }
    return {
      v: 1,
      type: 'withdrawal',
      record: {
        receiptId: rec['receiptId'],
        storageKey: rec['storageKey'],
        statement,
        submittedAt: rec['submittedAt'],
      },
    };
  }
  return undefined;
}

/**
 * Append-only JSON Lines store. Every withdrawal and every acknowledgement is
 * one line; nothing is ever rewritten. The file is created with mode 0600 (and
 * tightened to 0600 if it exists) and a missing directory with mode 0700. A
 * directory writable by group or others, or owned by another user (other than
 * root), is refused. Symbolic links are refused.
 *
 * Suitable for one process. For several processes or servers, implement
 * {@link WithdrawalStore} on your database. The whole log is read into
 * memory on first use.
 *
 * @example
 * ```ts
 * const store = new FileStore({ directory: '/var/lib/shop/withdrawals' });
 * ```
 */
export class FileStore implements WithdrawalStore {
  readonly path: string;
  readonly #directory: string;
  readonly #fsync: boolean;
  #records: Map<string, StoredWithdrawal> | undefined;
  #skippedLines = 0;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(options: FileStoreOptions) {
    this.path = resolveStorePath(options.directory, options.fileName ?? 'withdrawals.jsonl');
    this.#directory = resolve(options.directory);
    this.#fsync = options.fsync ?? true;
  }

  /** Number of malformed lines skipped while loading. */
  get skippedLines(): number {
    return this.#skippedLines;
  }

  /** Runs `task` after every earlier task, so writes never interleave. */
  #serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(task, task);
    this.#queue = run.catch(() => undefined);
    return run;
  }

  async #openForAppend(): Promise<FileHandle> {
    const flags =
      fsConstants.O_WRONLY | fsConstants.O_APPEND | fsConstants.O_CREAT | O_NOFOLLOW;
    const handle = await open(this.path, flags, 0o600);
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) throw new Error('Store path is not a regular file');
      if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) await handle.chmod(0o600);
    } catch (error) {
      await handle.close();
      throw error;
    }
    return handle;
  }

  async #load(): Promise<Map<string, StoredWithdrawal>> {
    if (this.#records !== undefined) return this.#records;
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    const dirStat = await lstat(this.#directory);
    if (!dirStat.isDirectory()) throw new Error('Store directory is not a directory');
    // A directory other users can write to would let them replace the log. Never change the
    // permissions of an existing directory (it may be shared); refuse it instead.
    if (process.platform !== 'win32' && (dirStat.mode & 0o022) !== 0) {
      throw new Error('Store directory must not be writable by group or others');
    }
    if (!isTrustedOwner(dirStat.uid, process.getuid?.())) {
      throw new Error('Store directory must be owned by this user or root');
    }

    let content = '';
    try {
      const stat = await lstat(this.path);
      if (!stat.isFile()) throw new Error('Store path is not a regular file');
      content = await readFile(this.path, { encoding: 'utf8', flag: fsConstants.O_RDONLY | O_NOFOLLOW });
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }

    const records = new Map<string, StoredWithdrawal>();
    for (const line of content.split('\n')) {
      if (line.trim() === '') continue;
      const parsed = parseLogLine(line);
      if (parsed === undefined) {
        this.#skippedLines += 1;
        continue;
      }
      if (parsed.type === 'withdrawal') {
        if (!records.has(parsed.record.storageKey)) records.set(parsed.record.storageKey, Object.freeze(parsed.record));
      } else {
        const existing = records.get(parsed.storageKey);
        if (existing !== undefined) records.set(parsed.storageKey, Object.freeze({ ...existing, acknowledgedAt: parsed.at }));
      }
    }
    // A crash can leave a last line without its newline. Start the next write on a fresh line.
    if (content.length > 0 && !content.endsWith('\n')) await this.#append('\n');
    this.#records = records;
    return records;
  }

  async #append(text: string): Promise<void> {
    const handle = await this.#openForAppend();
    try {
      await handle.write(text);
      if (this.#fsync) await handle.sync();
    } finally {
      await handle.close();
    }
  }

  get(storageKey: string): Promise<StoredWithdrawal | undefined> {
    return this.#serial(async () => (await this.#load()).get(storageKey));
  }

  insert(record: StoredWithdrawal): Promise<InsertResult> {
    return this.#serial(async () => {
      const records = await this.#load();
      const existing = records.get(record.storageKey);
      if (existing !== undefined) return { inserted: false as const, existing };
      const clean: StoredWithdrawal = {
        receiptId: record.receiptId,
        storageKey: record.storageKey,
        statement: record.statement,
        submittedAt: record.submittedAt,
      };
      const line: LogLine = { v: 1, type: 'withdrawal', record: clean };
      await this.#append(JSON.stringify(line) + '\n');
      records.set(record.storageKey, Object.freeze(clean));
      return { inserted: true as const };
    });
  }

  markAcknowledged(storageKey: string, at: string): Promise<void> {
    return this.#serial(async () => {
      const records = await this.#load();
      const existing = records.get(storageKey);
      if (existing === undefined) return;
      const line: LogLine = { v: 1, type: 'acknowledged', storageKey, at };
      await this.#append(JSON.stringify(line) + '\n');
      records.set(storageKey, Object.freeze({ ...existing, acknowledgedAt: at }));
    });
  }

  /** Records without an acknowledgement, submitted at or after `since`, oldest first. */
  listUnacknowledged(since: string, limit: number): Promise<readonly StoredWithdrawal[]> {
    return this.#serial(async () => unacknowledged((await this.#load()).values(), since, limit));
  }

    /** All records, oldest first. */
  list(): Promise<readonly StoredWithdrawal[]> {
    return this.#serial(async () => [...(await this.#load()).values()]);
  }
}
