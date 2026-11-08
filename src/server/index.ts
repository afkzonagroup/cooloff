/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Runtime-agnostic server side: the Fetch API handler, stores, rate limiter
 * and HTTP helpers. Node-only parts live in `@afkzona/cooloff/node`,
 * `@afkzona/cooloff/express`, `@afkzona/cooloff/next` and
 * `@afkzona/cooloff/file-store`.
 *
 * @packageDocumentation
 */

export * from './types.js';
export * from './handler.js';
export * from './http.js';
export * from './memory-store.js';
export * from './rate-limit.js';
