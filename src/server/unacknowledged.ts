/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StoredWithdrawal } from './types.js';

/** Records without an acknowledgement, submitted at or after `since`, oldest first, at most `limit`. */
export function unacknowledged(records: Iterable<StoredWithdrawal>, since: string, limit: number): StoredWithdrawal[] {
  const out: StoredWithdrawal[] = [];
  for (const record of records) {
    if (record.acknowledgedAt === undefined && record.submittedAt >= since) out.push(record);
  }
  return out.sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : a.submittedAt > b.submittedAt ? 1 : 0)).slice(0, limit);
}
