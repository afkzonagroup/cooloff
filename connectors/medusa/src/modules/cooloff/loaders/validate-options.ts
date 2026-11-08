/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import { isValidTimeZone, MIN_SECRET_BYTES } from '@afkzona/cooloff/core';
import { normaliseOrigin } from '@afkzona/cooloff/server';

import type { CooloffPluginOptions } from '../options';

/** Problems with the plugin options and the environment. Empty when valid. */
export function optionProblems(options: Partial<CooloffPluginOptions> | undefined, env: NodeJS.ProcessEnv): string[] {
  const problems: string[] = [];
  if (typeof options?.traderName !== 'string' || options.traderName.trim() === '') problems.push('traderName is required');
  if (typeof options?.timeZone !== 'string' || !isValidTimeZone(options.timeZone)) {
    problems.push('timeZone must be an IANA time zone such as Europe/Vilnius');
  }
  const secret = env['COOLOFF_SECRET'];
  if (secret === undefined || Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES) {
    problems.push(`the COOLOFF_SECRET environment variable must hold at least ${String(MIN_SECRET_BYTES)} bytes`);
  }
  const origins = options?.allowedOrigins;
  if (origins !== undefined) {
    if (!Array.isArray(origins) || origins.length === 0) problems.push('allowedOrigins must list at least one origin');
    else {
      for (const origin of origins as unknown[]) {
        try {
          normaliseOrigin(String(origin));
        } catch {
          problems.push(`allowedOrigins: ${String(origin).slice(0, 100)} is not an origin such as https://shop.example`);
        }
      }
    }
  }
  const limit = options?.rateLimitPerMinute;
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) problems.push('rateLimitPerMinute must be a positive integer');
  return problems;
}

/** Module loader: refuses to start Medusa with an unusable configuration. */
export default function validateOptions({ options }: { options?: Partial<CooloffPluginOptions> }): Promise<void> {
  const problems = optionProblems(options, process.env);
  if (problems.length > 0) return Promise.reject(new Error(`Cooloff plugin configuration: ${problems.join('; ')}`));
  return Promise.resolve();
}
