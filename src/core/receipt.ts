/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import type { WithdrawalRequest } from './schema.js';

/** Minimum secret length in bytes (UTF-8) for receipt IDs. */
export const MIN_SECRET_BYTES = 32;

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const encoder = new TextEncoder();

function subtle(): SubtleCrypto {
  const crypto = (globalThis as { crypto?: Crypto }).crypto;
  /* c8 ignore next 3 -- Node >= 20 and all supported browsers have Web Crypto */
  if (crypto?.subtle === undefined) {
    throw new Error('Web Crypto (crypto.subtle) is not available in this runtime');
  }
  return crypto.subtle;
}

/** Encodes bytes as Crockford base32 (no padding). */
export function base32Crockford(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31] ?? '';
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += CROCKFORD[(value << (5 - bits)) & 31] ?? '';
  return out;
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

/**
 * Checks that a secret is long enough. Secrets must come from configuration
 * (for example an environment variable), never from source code.
 *
 * @throws TypeError if the secret is shorter than {@link MIN_SECRET_BYTES} bytes.
 */
export function assertSecret(secret: string): void {
  if (encoder.encode(secret).length < MIN_SECRET_BYTES) {
    throw new TypeError(`The secret must be at least ${String(MIN_SECRET_BYTES)} bytes long`);
  }
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  assertSecret(secret);
  const key = await subtle().importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return new Uint8Array(await subtle().sign('HMAC', key, encoder.encode(message)));
}

/**
 * Canonical, unambiguous serialisation of a request. JSON arrays keep order
 * and escape every string, so different requests never serialise the same.
 */
export function canonicalRequest(request: WithdrawalRequest): string {
  return JSON.stringify([
    'cooloff-v1',
    request.idempotencyKey,
    request.name,
    request.contract,
    request.email,
    [...request.items],
    request.language,
  ]);
}

/**
 * Computes the deterministic receipt ID for a request:
 * `WD-` followed by 16 Crockford base32 characters (80 bits of
 * HMAC-SHA-256 over {@link canonicalRequest}), grouped in fours.
 *
 * The same request with the same secret always gives the same ID. A
 * different name, contract, e-mail, item list, language or idempotency key
 * gives a different ID.
 *
 * @example
 * ```ts
 * const id = await computeReceiptId(process.env.COOLOFF_SECRET!, request);
 * // 'WD-7K3Q-M2XA-9C1D-T0VB'
 * ```
 */
export async function computeReceiptId(secret: string, request: WithdrawalRequest): Promise<string> {
  const mac = await hmac(secret, canonicalRequest(request));
  const code = base32Crockford(mac.subarray(0, 10));
  return `WD-${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}-${code.slice(12, 16)}`;
}

/**
 * Derives the storage key for an idempotency key (HMAC, hex). The raw key
 * sent by the browser is never stored.
 */
export async function idempotencyStorageKey(secret: string, idempotencyKey: string): Promise<string> {
  return toHex(await hmac(secret, `cooloff-idempotency-v1\n${idempotencyKey}`));
}

/**
 * Compares two strings in time that depends only on their lengths, not on
 * where they first differ.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}
