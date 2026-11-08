/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  createWithdrawalHandler,
  DEFAULT_MAX_BODY_BYTES,
  type WithdrawalHandler,
  type WithdrawalHandlerOptions,
} from './handler.js';
import { adaptToNode } from './node.js';

/**
 * The parts of an Express (or Connect-style) request this adapter uses.
 * Typed structurally so the package does not depend on Express.
 */
export interface ExpressLikeRequest extends IncomingMessage {
  /** Client address as computed by Express, honouring its `trust proxy` setting. */
  readonly ip?: string | undefined;
  /** Set by body parsers. Must be untouched: mount Cooloff before them. */
  readonly body?: unknown;
}

/** Express-style `next` callback. */
export type NextFunction = (error?: unknown) => void;

/** An Express-style middleware. */
export type ExpressMiddleware = (req: ExpressLikeRequest, res: ServerResponse, next: NextFunction) => void;

/** The middleware with the retry of pending acknowledgements. */
export type ExpressWithdrawalMiddleware = ExpressMiddleware & Pick<WithdrawalHandler, 'retryPendingAcknowledgements'>;

/** Options of {@link createExpressMiddleware}. */
export interface ExpressMiddlewareOptions extends WithdrawalHandlerOptions {
  /**
   * Returns the client address for rate limiting. Default: `req.ip`, which
   * follows Express's `trust proxy` setting, falling back to the socket address.
   */
  readonly clientAddress?: (req: ExpressLikeRequest) => string | undefined;
}

/**
 * Creates Express-style middleware for the withdrawal endpoint. Mount it on
 * the endpoint path, before any body parser such as `express.json()`, because
 * it reads the raw body itself to enforce the size limit.
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { createExpressMiddleware } from '@afkzona/cooloff/express';
 *
 * const app = express();
 * app.post('/api/withdrawal', createExpressMiddleware({ ...options }));
 * app.use(express.json()); // other routes
 * ```
 */
export function createExpressMiddleware(options: ExpressMiddlewareOptions): ExpressWithdrawalMiddleware {
  const handler = createWithdrawalHandler(options);
  const getAddress =
    options.clientAddress ?? ((req: ExpressLikeRequest) => req.ip ?? req.socket.remoteAddress);
  const node = adaptToNode(handler, options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES, (req) =>
    getAddress(req),
  );
  const middleware: ExpressMiddleware = (req, res, next) => {
    if (req.body !== undefined || req.readableEnded) {
      next(new Error('Cooloff middleware must be mounted before body parsers'));
      return;
    }
    node(req, res).catch(next);
  };
  return Object.assign(middleware, { retryPendingAcknowledgements: handler.retryPendingAcknowledgements });
}
