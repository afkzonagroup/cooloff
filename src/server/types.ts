/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Acknowledgement } from '../core/acknowledgement.js';
import type { RenderedEmail } from '../core/email.js';
import type { WithdrawalStatement } from '../core/schema.js';

/** A withdrawal as kept by a store. */
export interface StoredWithdrawal {
  /** Deterministic receipt ID. */
  readonly receiptId: string;
  /** HMAC of the client's idempotency key. The raw key is never stored. */
  readonly storageKey: string;
  /** The validated, normalised statement. */
  readonly statement: WithdrawalStatement;
  /** ISO 8601 UTC instant the server received the confirmed statement. */
  readonly submittedAt: string;
  /** ISO 8601 UTC instant the acknowledgement was handed to the notifier, if it was. */
  readonly acknowledgedAt?: string;
}

/** Result of {@link WithdrawalStore.insert}. */
export type InsertResult =
  | { readonly inserted: true }
  | { readonly inserted: false; readonly existing: StoredWithdrawal };

/**
 * Where withdrawals are kept. Implement it for your database. The law does
 * not prescribe storage; keeping a record is an implementation choice that
 * helps the trader prove when a withdrawal was submitted (Art. 11a(5)).
 */
export interface WithdrawalStore {
  /** Returns the withdrawal with this storage key, if any. */
  get(storageKey: string): Promise<StoredWithdrawal | undefined>;
  /**
   * Inserts a withdrawal unless one with the same storage key exists. Must be
   * atomic with respect to the storage key.
   */
  insert(record: StoredWithdrawal): Promise<InsertResult>;
  /** Records that the acknowledgement was sent. */
  markAcknowledged(storageKey: string, at: string): Promise<void>;
  /**
   * Optional. Withdrawals without an acknowledgement submitted at or after
   * `since` (ISO 8601 UTC), oldest first, at most `limit`. Needed for
   * `retryPendingAcknowledgements`.
   */
  listUnacknowledged?(since: string, limit: number): Promise<readonly StoredWithdrawal[]>;
}

/**
 * Sends the acknowledgement of receipt on a durable medium (Art. 11a(4)).
 * Implement it with your own mail transport. Throw to signal failure; the
 * withdrawal stays recorded and a retry of the same submission sends again.
 */
export interface Notifier {
  send(email: RenderedEmail, acknowledgement: Acknowledgement): Promise<void>;
}

/** Result of {@link RateLimiter.consume}. */
export interface RateLimitResult {
  readonly allowed: boolean;
  /** Seconds until a new attempt may succeed. Present when `allowed` is false. */
  readonly retryAfterSeconds?: number;
}

/** Limits how often one client may submit. */
export interface RateLimiter {
  consume(key: string): Promise<RateLimitResult> | RateLimitResult;
}

/** Per-request context supplied by the adapter. */
export interface RequestContext {
  /**
   * Network address of the client, used as the rate-limit key. Adapters for
   * Node and Express fill it in. Leave it out only if you rate-limit elsewhere.
   */
  readonly clientAddress?: string;
}

/** Phases reported to {@link WithdrawalHandlerOptions.onError}. */
export type ErrorPhase = 'store' | 'notify' | 'hook' | 'internal';
