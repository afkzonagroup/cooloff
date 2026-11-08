/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Cooloff: the withdrawal function of Article 11a of Directive 2011/83/EU.
 * The root entry exports the core and the runtime-agnostic server parts. The
 * web component is in `@afkzona/cooloff/component`.
 *
 * @packageDocumentation
 */

export * from './core/index.js';
export * from './server/index.js';
