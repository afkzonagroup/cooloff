/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import { createWithdrawalHandler, type WithdrawalHandler, type WithdrawalHandlerOptions } from './handler.js';

/** Options of {@link createNextRouteHandlers}. */
export interface NextRouteHandlerOptions extends WithdrawalHandlerOptions {
  /**
   * Returns the client address for rate limiting. Next.js route handlers get
   * no socket address, so this is required unless you pass
   * `rateLimiter: false` and limit elsewhere: with one shared bucket a single
   * client could block the withdrawal function for everyone. Use
   * {@link forwardedForAddress} when your platform sets a trustworthy
   * `X-Forwarded-For` header.
   */
  readonly clientAddress?: (request: Request) => string | undefined;
}

/**
 * Reads the client address from `X-Forwarded-For`, taking the entry
 * `hopsFromRight` positions from the right (default 0 = the last entry,
 * added by the proxy closest to you). Only use it behind a proxy that sets
 * this header, such as Vercel or a load balancer you control; otherwise
 * clients can choose their own rate-limit key.
 */
export function forwardedForAddress(request: Request, hopsFromRight = 0): string | undefined {
  const header = request.headers.get('x-forwarded-for');
  if (header === null || header.length > 1000) return undefined;
  const entries = header.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  const entry = entries[entries.length - 1 - hopsFromRight];
  return entry !== undefined && entry.length <= 64 ? entry : undefined;
}

/** Route handlers for a Next.js App Router `route.ts` file. */
export interface NextRouteHandlers {
  readonly POST: (request: Request) => Promise<Response>;
  /** See {@link WithdrawalHandler.retryPendingAcknowledgements}. Call it from a scheduled job. */
  readonly retryPendingAcknowledgements: WithdrawalHandler['retryPendingAcknowledgements'];
}

/**
 * Creates App Router route handlers. Next.js answers other methods with 405.
 *
 * @throws TypeError if neither `clientAddress` nor `rateLimiter: false` is given.
 *
 * @example
 * ```ts
 * // app/api/withdrawal/route.ts
 * import { createNextRouteHandlers, forwardedForAddress } from '@afkzona/cooloff/next';
 * export const runtime = 'nodejs';
 * export const { POST } = createNextRouteHandlers({ ...options, clientAddress: (r) => forwardedForAddress(r) });
 * ```
 */
export function createNextRouteHandlers(options: NextRouteHandlerOptions): NextRouteHandlers {
  if (options.clientAddress === undefined && options.rateLimiter !== false) {
    throw new TypeError('createNextRouteHandlers needs clientAddress, or rateLimiter: false if you rate-limit elsewhere');
  }
  const handler = createWithdrawalHandler(options);
  const getAddress = options.clientAddress;
  return {
    POST: (request: Request) => {
      const address = getAddress?.(request);
      return handler(request, address === undefined ? {} : { clientAddress: address });
    },
    retryPendingAcknowledgements: handler.retryPendingAcknowledgements,
  };
}
