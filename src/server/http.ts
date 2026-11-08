/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/** Headers added to every response of the handler. */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
});

/** Builds a JSON response with the security headers. */
export function jsonResponse(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, ...extraHeaders },
  });
}

/**
 * Normalises a configured origin such as `https://Shop.example:443/` to
 * `https://shop.example`. Only `http:` and `https:` origins are accepted.
 *
 * @throws TypeError for anything that is not a plain origin.
 */
export function normaliseOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(`Invalid origin: ${value}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TypeError(`Origin must use http or https: ${value}`);
  }
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '' || (url.pathname !== '/' && url.pathname !== '')) {
    throw new TypeError(`Origin must not contain a path, query, fragment or credentials: ${value}`);
  }
  return url.origin;
}

/** Result of {@link checkOrigin}. */
export type OriginCheck = { readonly ok: true } | { readonly ok: false; readonly reason: 'missing' | 'mismatch' };

/**
 * Cross-site request forgery protection by origin check.
 *
 * Why an origin check and not a token: the consumer is often not logged in,
 * so there is no session to bind a token to, and shop pages are often cached,
 * which breaks per-page tokens. Browsers send the `Origin` header on every
 * cross-origin and same-origin `POST` made with `fetch`, and a page cannot
 * forge it. The handler also requires `Content-Type: application/json`, which
 * a cross-site HTML form cannot send and which forces a CORS preflight for
 * cross-site `fetch`; no CORS headers are ever sent, so that preflight fails.
 *
 * Rules: if `Origin` is present it must equal one of `allowedOrigins`
 * (`null` never matches). If it is absent, `Sec-Fetch-Site: same-origin` is
 * accepted; otherwise the request is refused unless `allowMissingOrigin` is
 * set (for non-browser clients you trust by other means).
 */
export function checkOrigin(
  headers: Headers,
  allowedOrigins: ReadonlySet<string>,
  allowMissingOrigin = false,
): OriginCheck {
  const origin = headers.get('origin');
  if (origin !== null) {
    return allowedOrigins.has(origin.toLowerCase()) ? { ok: true } : { ok: false, reason: 'mismatch' };
  }
  const fetchSite = headers.get('sec-fetch-site');
  if (fetchSite === 'same-origin') return { ok: true };
  if (fetchSite !== null && fetchSite !== 'none') return { ok: false, reason: 'mismatch' };
  return allowMissingOrigin ? { ok: true } : { ok: false, reason: 'missing' };
}

/**
 * Returns `true` for `application/json`, optionally with `charset=utf-8`.
 * Every other media type or charset is refused.
 */
export function isJsonContentType(value: string | null): boolean {
  if (value === null || value.length > 100) return false;
  const [type, ...params] = value.split(';').map((part) => part.trim().toLowerCase());
  if (type !== 'application/json') return false;
  for (const param of params) {
    if (param === '') continue;
    const [name, rawValue] = param.split('=', 2).map((part) => part.trim());
    if (name !== 'charset') return false;
    const charset = (rawValue ?? '').replace(/^"(.*)"$/u, '$1');
    if (charset !== 'utf-8' && charset !== 'utf8') return false;
  }
  return true;
}

/** Thrown by {@link readBodyWithLimit} when the body is larger than allowed. */
export class BodyTooLargeError extends Error {
  constructor() {
    super('Request body too large');
    this.name = 'BodyTooLargeError';
  }
}

/** Thrown by {@link readBodyWithLimit} when the body is not valid UTF-8. */
export class InvalidEncodingError extends Error {
  constructor() {
    super('Request body is not valid UTF-8');
    this.name = 'InvalidEncodingError';
  }
}

/**
 * Reads a request body as UTF-8 text, stopping as soon as it exceeds
 * `maxBytes`. A declared `Content-Length` above the limit is refused before
 * reading.
 *
 * @throws BodyTooLargeError
 * @throws InvalidEncodingError
 */
export async function readBodyWithLimit(request: Request, maxBytes: number): Promise<string> {
  const declared = request.headers.get('content-length');
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isFinite(length) || length < 0) throw new BodyTooLargeError();
    if (length > maxBytes) throw new BodyTooLargeError();
  }
  if (request.body === null) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    throw new InvalidEncodingError();
  }
}
