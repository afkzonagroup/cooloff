/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import Medusa from '@medusajs/js-sdk';

/** JS SDK client for the admin, using the dashboard's session. */
export const sdk = new Medusa({
  baseUrl: (import.meta.env['VITE_BACKEND_URL'] as string | undefined) ?? '/',
  auth: { type: 'session' },
});

/** A withdrawal row as returned by GET /admin/cooloff/withdrawals. */
export interface WithdrawalRow {
  id: string;
  receipt_id: string;
  name: string;
  contract: string;
  email: string;
  items: unknown;
  language: string;
  submitted_at: string;
  acknowledged_at: string | null;
  order_id: string | null;
}

/** Response of GET /admin/cooloff/withdrawals. */
export interface WithdrawalList {
  withdrawals: WithdrawalRow[];
  count: number;
  limit: number;
  offset: number;
}

/** Items as text: the list, or "Whole contract". */
export function itemsText(items: unknown): string {
  return Array.isArray(items) && items.length > 0 ? items.filter((i) => typeof i === 'string').join('; ') : 'Whole contract';
}

/** `2026-06-19T08:30:00.000Z` as `2026-06-19 08:30:00 UTC`. */
export function utcText(iso: string | null): string {
  return iso === null ? 'Not yet' : `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}
