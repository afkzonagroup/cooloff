/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import { model } from '@medusajs/framework/utils';

/**
 * One withdrawal sent through the withdrawal function (Art. 11a of
 * Directive 2011/83/EU). Times are ISO 8601 strings in UTC, kept as text so
 * the stored value is exactly the one in the acknowledgement.
 */
const Withdrawal = model
  .define('cooloff_withdrawal', {
    id: model.id({ prefix: 'wdr' }).primaryKey(),
    receipt_id: model.text().index(),
    storage_key: model.text().unique(),
    name: model.text(),
    contract: model.text(),
    email: model.text(),
    items: model.json(),
    language: model.text(),
    submitted_at: model.text().index(),
    acknowledged_at: model.text().nullable(),
    order_id: model.text().nullable(),
  });

export default Withdrawal;
