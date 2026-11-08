/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RateLimiter, RateLimitResult } from './types.js';

/** Options for {@link MemoryRateLimiter}. */
export interface MemoryRateLimiterOptions {
  /** Attempts allowed per key and window. Default 10. */
  readonly limit?: number;
  /** Window length in milliseconds. Default 60 000. */
  readonly windowMs?: number;
  /** Most keys tracked at once; the oldest are dropped first. Default 10 000. */
  readonly maxKeys?: number;
  /** Clock, for tests. */
  readonly now?: () => number;
}

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window rate limiter kept in memory. Suitable for a single process.
 * Behind several processes or servers, implement {@link RateLimiter} with a
 * shared store such as Redis.
 *
 * Keep limits generous: withdrawing is a consumer right, and a limit that is
 * too strict blocks consumers who share an address (offices, mobile carriers).
 */
export class MemoryRateLimiter implements RateLimiter {
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #maxKeys: number;
  readonly #now: () => number;
  readonly #windows = new Map<string, Window>();

  constructor(options: MemoryRateLimiterOptions = {}) {
    this.#limit = positiveInteger(options.limit ?? 10, 'limit');
    this.#windowMs = positiveInteger(options.windowMs ?? 60_000, 'windowMs');
    this.#maxKeys = positiveInteger(options.maxKeys ?? 10_000, 'maxKeys');
    this.#now = options.now ?? Date.now;
  }

  consume(key: string): RateLimitResult {
    const now = this.#now();
    let window = this.#windows.get(key);
    if (window === undefined || window.resetAt <= now) {
      this.#windows.delete(key);
      this.#evict(now);
      window = { count: 0, resetAt: now + this.#windowMs };
      this.#windows.set(key, window);
    }
    window.count += 1;
    if (window.count <= this.#limit) return { allowed: true };
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)) };
  }

  /** Number of keys currently tracked. */
  get size(): number {
    return this.#windows.size;
  }

  #evict(now: number): void {
    if (this.#windows.size < this.#maxKeys) return;
    for (const [key, window] of this.#windows) {
      if (window.resetAt <= now) this.#windows.delete(key);
    }
    // Map iteration order is insertion order: drop the oldest until there is room.
    for (const key of this.#windows.keys()) {
      if (this.#windows.size < this.#maxKeys) break;
      this.#windows.delete(key);
    }
  }
}

/** Parses an IPv6 address into eight 16-bit groups, or `undefined`. */
function ipv6Groups(address: string): number[] | undefined {
  let text = address;
  let tail: number[] = [];
  const v4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(text);
  if (v4 !== null) {
    const bytes = v4.slice(1).map(Number);
    if (bytes.some((byte) => byte > 255)) return undefined;
    const [a = 0, b = 0, c = 0, d = 0] = bytes;
    tail = [(a << 8) | b, (c << 8) | d];
    text = text.slice(0, v4.index);
    if (text.endsWith(':') && !text.endsWith('::')) text = text.slice(0, -1);
  }
  const halves = text.split('::');
  if (halves.length > 2) return undefined;
  const parse = (part: string): number[] =>
    part === '' ? [] : part.split(':').map((group) => (/^[0-9a-f]{1,4}$/u.test(group) ? Number.parseInt(group, 16) : Number.NaN));
  const head = parse(halves[0] ?? '');
  const rest = halves.length === 2 ? parse(halves[1] ?? '') : [];
  const used = head.length + rest.length + tail.length;
  if ([...head, ...rest].some((group) => Number.isNaN(group))) return undefined;
  if (halves.length === 1 ? used !== 8 : used > 7) return undefined;
  return [...head, ...new Array<number>(8 - used).fill(0), ...rest, ...tail];
}

/**
 * Turns a client address into a rate-limit key.
 *
 * - IPv6 addresses are reduced to their /64 network. One customer line or
 *   server usually gets a whole /64, so limiting single IPv6 addresses would
 *   let one client use 2^64 keys.
 * - IPv4-mapped IPv6 addresses (`::ffff:203.0.113.7`) become the IPv4 address.
 * - Zone IDs (`%eth0`) and brackets are removed.
 * - Anything else (IPv4, or a key your adapter computed) is kept, lower-cased
 *   and capped at 100 characters. A missing address becomes `unknown`.
 *
 * @example
 * ```ts
 * clientRateLimitKey('2001:db8:1:2:aaaa::1'); // '2001:db8:1:2::/64'
 * clientRateLimitKey('::ffff:203.0.113.7');   // '203.0.113.7'
 * ```
 */
export function clientRateLimitKey(address: string | undefined): string {
  if (address === undefined) return 'unknown';
  let text = address.slice(0, 200).trim().toLowerCase();
  if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1);
  // Drop an IPv6 zone index ("fe80::1%eth0"); indexOf keeps this linear on hostile input.
  const zone = text.indexOf('%');
  if (zone !== -1) text = text.slice(0, zone);
  if (text.length === 0) return 'unknown';
  if (!text.includes(':')) return text.slice(0, 100);
  const groups = ipv6Groups(text);
  if (groups === undefined) return text.slice(0, 100);
  const [g0, g1, g2, g3, g4, g5, g6 = 0, g7 = 0] = groups;
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    return `${String(g6 >> 8)}.${String(g6 & 255)}.${String(g7 >> 8)}.${String(g7 & 255)}`;
  }
  return `${groups.slice(0, 4).map((group) => group.toString(16)).join(':')}::/64`;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
}
