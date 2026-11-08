/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

import { createWithdrawalHandler, DEFAULT_MAX_BODY_BYTES, type WithdrawalHandler, type WithdrawalHandlerOptions } from './handler.js';
import { SECURITY_HEADERS } from './http.js';

/** Options of {@link createNodeHandler}. */
export interface NodeHandlerOptions extends WithdrawalHandlerOptions {
  /**
   * Returns the client address used for rate limiting. Default: the socket's
   * remote address. Behind a reverse proxy, return the address your proxy
   * reports, and only if you trust that proxy.
   */
  readonly clientAddress?: (req: IncomingMessage) => string | undefined;
}

/** A Node `http` request listener. */
export type NodeHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

/** A Node `http` request listener with the retry of pending acknowledgements. */
export type NodeWithdrawalHandler = NodeHandler & Pick<WithdrawalHandler, 'retryPendingAcknowledgements'>;

function toHeaders(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const item of value) headers.append(name, item);
    else headers.set(name, value);
  }
  return headers;
}

/**
 * Reads at most `maxBytes + 1` bytes of the body. If the body is larger the
 * returned buffer is `maxBytes + 1` long, so the handler answers 413, and
 * `truncated` is set so the adapter can close the connection.
 */
function readLimited(req: IncomingMessage, maxBytes: number): Promise<{ body: Uint8Array<ArrayBuffer>; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    const cleanup = (): void => {
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
    };
    const onData = (chunk: Buffer | string): void => {
      const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      if (total + buffer.length > maxBytes) {
        // Keep one byte too many so the handler answers 413, then stop reading.
        chunks.push(buffer.subarray(0, maxBytes + 1 - total));
        total = maxBytes + 1;
        cleanup();
        req.pause();
        resolve({ body: Buffer.concat(chunks, total), truncated: true });
        return;
      }
      chunks.push(buffer);
      total += buffer.length;
    };
    const onEnd = (): void => {
      cleanup();
      resolve({ body: Buffer.concat(chunks, total), truncated: false });
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
}

/** Converts a Node request into a Fetch API `Request` with a size-capped body. */
export async function toFetchRequest(
  req: IncomingMessage,
  maxBytes: number,
): Promise<{ request: Request; truncated: boolean }> {
  const headers = toHeaders(req);
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (method !== 'POST') {
    return { request: new Request(url, { method, headers }), truncated: false };
  }
  const declared = Number(headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) {
    // Do not read a body we will refuse anyway.
    return { request: new Request(url, { method, headers }), truncated: true };
  }
  const { body, truncated } = await readLimited(req, maxBytes);
  headers.delete('content-length');
  return { request: new Request(url, { method, headers, body }), truncated };
}

/** Writes a Fetch API `Response` to a Node response. */
export async function sendFetchResponse(response: Response, res: ServerResponse): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => {
    res.setHeader(name, value);
  });
  const body = Buffer.from(await response.arrayBuffer());
  res.setHeader('content-length', String(body.length));
  res.end(body);
}

/**
 * Adapts a {@link WithdrawalHandler} to Node `http`. Exported for adapters
 * that build their own handler.
 */
export function adaptToNode(
  handler: WithdrawalHandler,
  maxBodyBytes: number,
  clientAddress: (req: IncomingMessage) => string | undefined = (req) => req.socket.remoteAddress,
): NodeHandler {
  return async (req, res) => {
    let truncated = false;
    try {
      const address = clientAddress(req);
      const converted = await toFetchRequest(req, maxBodyBytes);
      truncated = converted.truncated;
      const response = await handler(converted.request, address === undefined ? {} : { clientAddress: address });
      if (truncated) res.setHeader('connection', 'close');
      await sendFetchResponse(response, res);
    } catch {
      if (!res.headersSent) {
        res.statusCode = 500;
        for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
        res.end(JSON.stringify({ error: 'internal_error' }));
      } else {
        res.destroy();
      }
    } finally {
      // Stop an oversize upload once the 413 has been written.
      if (truncated) {
        if (res.writableFinished) req.destroy();
        else res.once('finish', () => req.destroy());
      }
    }
  };
}

/**
 * Creates a Node `http` request listener for the withdrawal endpoint.
 * Route requests for your endpoint path to it. Call its
 * `retryPendingAcknowledgements()` on a schedule.
 *
 * @example
 * ```ts
 * import { createServer } from 'node:http';
 * import { createNodeHandler } from '@afkzona/cooloff/node';
 *
 * const withdraw = createNodeHandler({ ...options });
 * createServer((req, res) => {
 *   if (req.url === '/api/withdrawal') void withdraw(req, res);
 *   else { res.statusCode = 404; res.end(); }
 * }).listen(3000);
 * ```
 */
export function createNodeHandler(options: NodeHandlerOptions): NodeWithdrawalHandler {
  const handler = createWithdrawalHandler(options);
  const node = adaptToNode(handler, options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES, options.clientAddress);
  return Object.assign(node, { retryPendingAcknowledgements: handler.retryPendingAcknowledgements });
}
