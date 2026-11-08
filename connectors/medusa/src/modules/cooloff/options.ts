/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/** Plugin options, set in medusa-config.ts. */
export interface CooloffPluginOptions {
  /** Trader name shown in the acknowledgement. Required. */
  readonly traderName: string;
  /** IANA time zone of the shop, e.g. `Europe/Vilnius`. Required. */
  readonly timeZone: string;
  /**
   * Origins of your storefronts, e.g. `['https://shop.example']`. Default:
   * the plain (non-regex) entries of `projectConfig.http.storeCors`.
   */
  readonly allowedOrigins?: readonly string[];
  /** Accept partial withdrawal (a list of items). Default `false`. */
  readonly allowPartial?: boolean;
  /** Notification template name passed to the Notification Module. Default `cooloff-withdrawal-acknowledgement`. */
  readonly notificationTemplate?: string;
  /** Rate limit per client address and minute. Default 10. */
  readonly rateLimitPerMinute?: number;
}
