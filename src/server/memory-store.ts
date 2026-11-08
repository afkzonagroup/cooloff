/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InsertResult, StoredWithdrawal, WithdrawalStore } from './types.js';
import { unacknowledged } from './unacknowledged.js';

/**
 * Keeps withdrawals in memory. Everything is lost when the process stops, so
 * use it for tests and demos only. For production use {@link FileStore} or
 * your own database-backed {@link WithdrawalStore}.
 */
export class MemoryStore implements WithdrawalStore {
  readonly #records = new Map<string, StoredWithdrawal>();

  get(storageKey: string): Promise<StoredWithdrawal | undefined> {
    return Promise.resolve(this.#records.get(storageKey));
  }

  insert(record: StoredWithdrawal): Promise<InsertResult> {
    const existing = this.#records.get(record.storageKey);
    if (existing !== undefined) return Promise.resolve({ inserted: false, existing });
    this.#records.set(record.storageKey, Object.freeze({ ...record }));
    return Promise.resolve({ inserted: true });
  }

  markAcknowledged(storageKey: string, at: string): Promise<void> {
    const existing = this.#records.get(storageKey);
    if (existing !== undefined) {
      this.#records.set(storageKey, Object.freeze({ ...existing, acknowledgedAt: at }));
    }
    return Promise.resolve();
  }

  /** Records without an acknowledgement, submitted at or after `since`, oldest first. */
  listUnacknowledged(since: string, limit: number): Promise<readonly StoredWithdrawal[]> {
    return Promise.resolve(unacknowledged(this.#records.values(), since, limit));
  }

  /** All records, oldest first. */
  list(): readonly StoredWithdrawal[] {
    return [...this.#records.values()];
  }
}
