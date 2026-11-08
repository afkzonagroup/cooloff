/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import { buildAcknowledgement, type Acknowledgement, type TraderInfo } from '../core/acknowledgement.js';
import { renderAcknowledgementEmail } from '../core/email.js';
import type { OfficialLanguage } from '../core/labels.js';
import type { Messages } from '../core/messages.js';
import { assertSecret, computeReceiptId, idempotencyStorageKey, timingSafeEqual } from '../core/receipt.js';
import { validateWithdrawalRequest, type ValidationError } from '../core/schema.js';
import { isValidTimeZone } from '../core/time.js';
import {
  BodyTooLargeError,
  checkOrigin,
  InvalidEncodingError,
  isJsonContentType,
  jsonResponse,
  normaliseOrigin,
  readBodyWithLimit,
} from './http.js';
import { clientRateLimitKey, MemoryRateLimiter } from './rate-limit.js';
import type { ErrorPhase, Notifier, RateLimiter, RequestContext, StoredWithdrawal, WithdrawalStore } from './types.js';

/** Default request body limit: 16 KiB. A full statement is well under 4 KiB. */
export const DEFAULT_MAX_BODY_BYTES = 16 * 1024;

/** Hard upper bound for `maxBodyBytes`. */
export const MAX_BODY_BYTES_LIMIT = 1024 * 1024;

/** Options of {@link createWithdrawalHandler}. */
export interface WithdrawalHandlerOptions {
  /**
   * Secret for receipt IDs and idempotency keys, at least 32 bytes. Read it
   * from the environment (for example `process.env.COOLOFF_SECRET`); never
   * hard-code it. Changing it changes the receipt IDs of new submissions.
   */
  readonly secret: string;
  /** Trader name and time zone for the acknowledgement. */
  readonly trader: TraderInfo;
  /** Origins allowed to submit, e.g. `['https://shop.example']`. */
  readonly allowedOrigins: readonly string[];
  /** Where withdrawals are recorded. */
  readonly store: WithdrawalStore;
  /** Sends the acknowledgement of receipt (Art. 11a(4)). */
  readonly notifier: Notifier;
  /**
   * Rate limiter. Default: {@link MemoryRateLimiter} with 10 attempts per
   * client address per minute. Pass `false` only if you limit elsewhere.
   */
  readonly rateLimiter?: RateLimiter | false;
  /**
   * Limits acknowledgement e-mails per recipient address, so the endpoint
   * cannot be used to flood someone's inbox from many addresses. The
   * withdrawal is always recorded; only the e-mail is held back (the response
   * says `pending`, and a later resubmission sends it). Default: 5 per hour
   * per address. The key is an HMAC of the address, never the address.
   * Pass `false` to switch it off.
   */
  readonly recipientRateLimiter?: RateLimiter | false;
  /** Maximum request body size in bytes. Default 16 KiB, at most 1 MiB. */
  readonly maxBodyBytes?: number;
  /** Accept partial withdrawal (a list of items). Default `false`. */
  readonly allowPartial?: boolean;
  /** Language used when a request has none. Default `en`. */
  readonly defaultLanguage?: OfficialLanguage;
  /** Overrides of interface strings per language, e.g. `{ de: { traderLabel: 'Händler' } }`. */
  readonly messages?: Partial<Record<OfficialLanguage, Partial<Messages>>>;
  /** Accept requests that carry neither `Origin` nor `Sec-Fetch-Site`. Default `false`. */
  readonly allowMissingOrigin?: boolean;
  /** Called once for every new withdrawal, after it is stored. Errors are reported to `onError`. */
  readonly onWithdrawal?: (record: StoredWithdrawal, acknowledgement: Acknowledgement) => Promise<void> | void;
  /**
   * Called when something fails. Receives the phase and the error. Never
   * receives the request body. Default: one line to `console.error` with the
   * error name only.
   */
  readonly onError?: (phase: ErrorPhase, error: unknown) => void;
  /** Clock, for tests. */
  readonly now?: () => Date;
}

/** Options of {@link WithdrawalHandler.retryPendingAcknowledgements}. */
export interface RetryOptions {
  /** Only records submitted within this many hours. Default 72, at most 720. */
  readonly maxAgeHours?: number;
  /** Most records handled in one call. Default 100, at most 1000. */
  readonly limit?: number;
}

/** Result of {@link WithdrawalHandler.retryPendingAcknowledgements}. */
export interface RetryResult {
  /** Acknowledgements handed to the notifier. */
  readonly sent: number;
  /** Acknowledgements still pending (notifier failed or recipient limit reached). */
  readonly pending: number;
}

/** A Fetch API request handler, plus the retry of pending acknowledgements. */
export interface WithdrawalHandler {
  (request: Request, context?: RequestContext): Promise<Response>;
  /**
   * Sends acknowledgements that are still pending: the notifier failed, or
   * the recipient limit held them back. Article 11a(4) requires the
   * acknowledgement without undue delay, so call this on a schedule (for
   * example every 15 minutes). Needs a store with `listUnacknowledged`
   * (`MemoryStore` and `FileStore` have it). The recipient limit still
   * applies. Never throws for a single failed e-mail; the store error of
   * `listUnacknowledged` is reported to `onError` and rethrown.
   *
   * @throws TypeError if the store has no `listUnacknowledged`.
   */
  readonly retryPendingAcknowledgements: (options?: RetryOptions) => Promise<RetryResult>;
}

/**
 * Key for the per-recipient e-mail limit: the address in lower case, with a
 * sub-address tag (`jane+1@example.eu`) removed, so tags cannot multiply the
 * limit for one inbox. Only used as an HMAC input, never stored.
 */
export function recipientLimitKey(email: string): string {
  const lower = email.toLowerCase();
  const at = lower.lastIndexOf('@');
  if (at <= 0) return lower;
  const local = lower.slice(0, at);
  const plus = local.indexOf('+');
  return (plus > 0 ? local.slice(0, plus) : local) + lower.slice(at);
}

/** Successful response body. */
export interface WithdrawalResponseBody {
  readonly receiptId: string;
  readonly submittedAt: { readonly utc: string; readonly local: string; readonly timeZone: string };
  /** `sent` if the notifier accepted the acknowledgement, `pending` if it failed and will be retried on resubmission. */
  readonly acknowledgement: 'sent' | 'pending';
  readonly statement: {
    readonly name: string;
    readonly contract: string;
    readonly email: string;
    readonly items: readonly string[];
    readonly language: OfficialLanguage;
  };
}

/** Marks a store failure that was already reported. */
class StoreFailure extends Error {
  constructor() {
    super('Store failure');
    this.name = 'StoreFailure';
  }
}

function defaultOnError(phase: ErrorPhase, error: unknown): void {
  const name = error instanceof Error ? error.name : typeof error;
  console.error(`[cooloff] ${phase} error: ${name}`);
}

function safeCall(onError: (phase: ErrorPhase, error: unknown) => void, phase: ErrorPhase, error: unknown): void {
  try {
    onError(phase, error);
  } catch {
    // A failing error reporter must not turn into a failing request.
  }
}

function publicErrors(errors: readonly ValidationError[]): ValidationError[] {
  return errors.slice(0, 20).map((error) => ({ field: error.field, code: error.code }));
}

/**
 * Creates the server side of the withdrawal function as a standard Fetch API
 * handler: `(Request) => Promise<Response>`. Use it directly in runtimes that
 * speak Fetch (Deno, Bun, Cloudflare Workers, Next.js route handlers) or
 * through the Node and Express adapters.
 *
 * It accepts only `POST` with `Content-Type: application/json`, checks the
 * origin, rate-limits, enforces a body size limit, validates the statement
 * (Art. 11a(2)), records it with the time of submission, sends the
 * acknowledgement of receipt (Art. 11a(4)) and answers with the receipt.
 * Submitting the same statement with the same idempotency key again returns
 * the same receipt and does not create a second record.
 *
 * Status codes: 201 created, 200 repeated submission, 400 invalid, 403
 * origin refused, 405 method, 409 idempotency key reused with different
 * content, 413 too large, 415 content type, 429 rate limited, 500 internal.
 * Error bodies are `{ "error": "<code>" }`; no stack traces or internal
 * messages are ever returned.
 *
 * @throws TypeError or RangeError at creation time if the options are invalid.
 *
 * @example
 * ```ts
 * const handler = createWithdrawalHandler({
 *   secret: process.env.COOLOFF_SECRET!,
 *   trader: { name: 'Example Shop', timeZone: 'Europe/Vilnius' },
 *   allowedOrigins: ['https://shop.example'],
 *   store: new MemoryStore(),
 *   notifier: { send: async (email) => mailer.send(email) },
 * });
 * const response = await handler(request, { clientAddress: '203.0.113.7' });
 * ```
 */
export function createWithdrawalHandler(options: WithdrawalHandlerOptions): WithdrawalHandler {
  assertSecret(options.secret);
  if (typeof options.trader.name !== 'string' || options.trader.name.trim().length === 0) {
    throw new TypeError('trader.name is required');
  }
  if (!isValidTimeZone(options.trader.timeZone)) {
    throw new RangeError('trader.timeZone must be an IANA time zone name');
  }
  if (options.allowedOrigins.length === 0) {
    throw new TypeError('allowedOrigins must list at least one origin');
  }
  const allowedOrigins = new Set(options.allowedOrigins.map((origin) => normaliseOrigin(origin)));
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1024 || maxBodyBytes > MAX_BODY_BYTES_LIMIT) {
    throw new RangeError(`maxBodyBytes must be an integer from 1024 to ${String(MAX_BODY_BYTES_LIMIT)}`);
  }
  const rateLimiter = options.rateLimiter === undefined ? new MemoryRateLimiter() : options.rateLimiter;
  const recipientLimiter =
    options.recipientRateLimiter === undefined
      ? new MemoryRateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 })
      : options.recipientRateLimiter;
  const onError = options.onError ?? defaultOnError;
  const now = options.now ?? (() => new Date());
  const validationOptions = {
    allowPartial: options.allowPartial === true,
    ...(options.defaultLanguage === undefined ? {} : { defaultLanguage: options.defaultLanguage }),
  };

  function acknowledgementFor(record: StoredWithdrawal): Acknowledgement {
    const overrides = options.messages?.[record.statement.language];
    return buildAcknowledgement({
      statement: record.statement,
      receiptId: record.receiptId,
      submittedAt: new Date(record.submittedAt),
      trader: options.trader,
      ...(overrides === undefined ? {} : { messages: overrides }),
    });
  }

  async function notify(record: StoredWithdrawal, ack: Acknowledgement): Promise<'sent' | 'pending'> {
    if (recipientLimiter !== false) {
      const key = await idempotencyStorageKey(options.secret, `recipient\n${recipientLimitKey(record.statement.email)}`);
      if (!(await recipientLimiter.consume(key)).allowed) return 'pending';
    }
    try {
      await options.notifier.send(renderAcknowledgementEmail(ack), ack);
    } catch (error) {
      safeCall(onError, 'notify', error);
      return 'pending';
    }
    try {
      await options.store.markAcknowledged(record.storageKey, now().toISOString());
    } catch (error) {
      safeCall(onError, 'store', error);
    }
    return 'sent';
  }

  function responseBody(ack: Acknowledgement, status: 'sent' | 'pending'): WithdrawalResponseBody {
    const { statement } = ack;
    return {
      receiptId: ack.receiptId,
      submittedAt: { utc: ack.submittedAt.utc, local: ack.submittedAt.local, timeZone: ack.submittedAt.timeZone },
      acknowledgement: status,
      statement: {
        name: statement.name,
        contract: statement.contract,
        email: statement.email,
        items: [...statement.items],
        language: statement.language,
      },
    };
  }

  /** Runs a store call; on failure reports phase `store` and rethrows so the request answers 500. */
  async function reportStore<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      safeCall(onError, 'store', error);
      throw new StoreFailure();
    }
  }

  async function replay(existing: StoredWithdrawal, receiptId: string): Promise<Response> {
    if (!timingSafeEqual(existing.receiptId, receiptId)) {
      return jsonResponse(409, { error: 'idempotency_conflict' });
    }
    const ack = acknowledgementFor(existing);
    const status = existing.acknowledgedAt === undefined ? await notify(existing, ack) : 'sent';
    return jsonResponse(200, responseBody(ack, status));
  }

  async function handle(request: Request, context: RequestContext): Promise<Response> {
    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'method_not_allowed' }, { Allow: 'POST' });
    }
    if (!checkOrigin(request.headers, allowedOrigins, options.allowMissingOrigin === true).ok) {
      return jsonResponse(403, { error: 'forbidden_origin' });
    }
    if (rateLimiter !== false) {
      const limit = await rateLimiter.consume(clientRateLimitKey(context.clientAddress));
      if (!limit.allowed) {
        return jsonResponse(429, { error: 'rate_limited' }, { 'Retry-After': String(limit.retryAfterSeconds ?? 60) });
      }
    }
    if (!isJsonContentType(request.headers.get('content-type'))) {
      return jsonResponse(415, { error: 'unsupported_media_type' });
    }

    let text: string;
    try {
      text = await readBodyWithLimit(request, maxBodyBytes);
    } catch (error) {
      if (error instanceof BodyTooLargeError) return jsonResponse(413, { error: 'payload_too_large' });
      if (error instanceof InvalidEncodingError) return jsonResponse(400, { error: 'invalid_encoding' });
      throw error;
    }

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return jsonResponse(400, { error: 'invalid_json' });
    }

    const result = validateWithdrawalRequest(body, validationOptions);
    if (!result.ok) {
      return jsonResponse(400, { error: 'validation_failed', errors: publicErrors(result.errors) });
    }
    const { idempotencyKey, ...statement } = result.value;

    const [receiptId, storageKey] = await Promise.all([
      computeReceiptId(options.secret, result.value),
      idempotencyStorageKey(options.secret, idempotencyKey),
    ]);

    const existing = await reportStore(() => options.store.get(storageKey));
    if (existing !== undefined) return replay(existing, receiptId);

    const record: StoredWithdrawal = {
      receiptId,
      storageKey,
      statement,
      submittedAt: now().toISOString(),
    };
    const inserted = await reportStore(() => options.store.insert(record));
    if (!inserted.inserted) return replay(inserted.existing, receiptId);

    const ack = acknowledgementFor(record);
    const status = await notify(record, ack);
    if (options.onWithdrawal !== undefined) {
      try {
        await options.onWithdrawal(record, ack);
      } catch (error) {
        safeCall(onError, 'hook', error);
      }
    }
    return jsonResponse(201, responseBody(ack, status));
  }

  async function retryPendingAcknowledgements(retry: RetryOptions = {}): Promise<RetryResult> {
    const list = options.store.listUnacknowledged?.bind(options.store);
    if (list === undefined) throw new TypeError('The store has no listUnacknowledged method');
    const maxAgeHours = retry.maxAgeHours ?? 72;
    const limit = retry.limit ?? 100;
    if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0 || maxAgeHours > 720) {
      throw new RangeError('maxAgeHours must be greater than 0 and at most 720');
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new RangeError('limit must be an integer from 1 to 1000');
    const since = new Date(now().getTime() - maxAgeHours * 3600 * 1000).toISOString();
    let records: readonly StoredWithdrawal[];
    try {
      records = await list(since, limit);
    } catch (error) {
      safeCall(onError, 'store', error);
      throw error;
    }
    let sent = 0;
    let pending = 0;
    for (const record of records.slice(0, limit)) {
      if (record.acknowledgedAt !== undefined) continue;
      let status: 'sent' | 'pending';
      try {
        status = await notify(record, acknowledgementFor(record));
      } catch (error) {
        safeCall(onError, 'notify', error);
        status = 'pending';
      }
      if (status === 'sent') sent += 1;
      else pending += 1;
    }
    return { sent, pending };
  }

  const handler = async (request: Request, context: RequestContext = {}): Promise<Response> => {
    try {
      return await handle(request, context);
    } catch (error) {
      if (!(error instanceof StoreFailure)) safeCall(onError, 'internal', error);
      return jsonResponse(500, { error: 'internal_error' });
    }
  };
  return Object.assign(handler, { retryPendingAcknowledgements });
}
