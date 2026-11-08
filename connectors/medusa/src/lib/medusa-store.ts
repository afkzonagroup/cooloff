/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InsertResult, StoredWithdrawal, WithdrawalStore } from '@afkzona/cooloff/server';
import type { OfficialLanguage } from '@afkzona/cooloff/core';

import type CooloffModuleService from '../modules/cooloff/service';

/** Row shape returned by the module service. */
interface WithdrawalRow {
  id: string;
  receipt_id: string;
  storage_key: string;
  name: string;
  contract: string;
  email: string;
  items: unknown;
  language: string;
  submitted_at: string;
  acknowledged_at: string | null;
  order_id: string | null;
}

function toRecord(row: WithdrawalRow): StoredWithdrawal {
  const items = Array.isArray(row.items) ? row.items.filter((item): item is string => typeof item === 'string') : [];
  return {
    receiptId: row.receipt_id,
    storageKey: row.storage_key,
    statement: {
      name: row.name,
      contract: row.contract,
      email: row.email,
      items,
      language: row.language as OfficialLanguage,
    },
    submittedAt: row.submitted_at,
    ...(row.acknowledged_at === null ? {} : { acknowledgedAt: row.acknowledged_at }),
  };
}

/** {@link WithdrawalStore} on the Cooloff module (PostgreSQL through Medusa). */
export class MedusaWithdrawalStore implements WithdrawalStore {
  constructor(
    private readonly service: CooloffModuleService,
    private readonly findOrderId: (record: StoredWithdrawal) => Promise<string | null> = () => Promise.resolve(null),
  ) {}

  async #row(storageKey: string): Promise<WithdrawalRow | undefined> {
    const rows = (await this.service.listWithdrawals({ storage_key: storageKey }, { take: 1 })) as unknown as WithdrawalRow[];
    return rows[0];
  }

  async get(storageKey: string): Promise<StoredWithdrawal | undefined> {
    const row = await this.#row(storageKey);
    return row === undefined ? undefined : toRecord(row);
  }

  async insert(record: StoredWithdrawal): Promise<InsertResult> {
    const orderId = await this.findOrderId(record);
    try {
      await this.service.createWithdrawals({
        receipt_id: record.receiptId,
        storage_key: record.storageKey,
        name: record.statement.name,
        contract: record.statement.contract,
        email: record.statement.email,
        items: [...record.statement.items] as unknown as Record<string, unknown>,
        language: record.statement.language,
        submitted_at: record.submittedAt,
        order_id: orderId,
      });
      return { inserted: true };
    } catch (error) {
      // The unique storage_key turns a concurrent duplicate into an error; answer with the stored record.
      const existing = await this.get(record.storageKey);
      if (existing !== undefined) return { inserted: false, existing };
      throw error;
    }
  }

  async markAcknowledged(storageKey: string, at: string): Promise<void> {
    const row = await this.#row(storageKey);
    if (row !== undefined) await this.service.updateWithdrawals({ id: row.id, acknowledged_at: at });
  }

  /** Withdrawals without an acknowledgement submitted at or after `since`, oldest first. */
  async listUnacknowledged(since: string, limit: number): Promise<readonly StoredWithdrawal[]> {
    const rows = (await this.service.listWithdrawals(
      { acknowledged_at: null, submitted_at: { $gte: since } },
      { take: limit, order: { submitted_at: 'ASC' } },
    )) as unknown as WithdrawalRow[];
    return rows.map(toRecord);
  }

  /** The Medusa row ID and order ID of a stored withdrawal. */
  async ids(storageKey: string): Promise<{ id: string; orderId: string | null } | undefined> {
    const row = await this.#row(storageKey);
    return row === undefined ? undefined : { id: row.id, orderId: row.order_id };
  }
}
