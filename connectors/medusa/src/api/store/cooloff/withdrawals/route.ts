/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';

import { getWithdrawalHandler } from '../../../../lib/handler';

/**
 * POST /store/cooloff/withdrawals: the online withdrawal statement
 * (Art. 11a(2)-(4) of Directive 2011/83/EU). The body parser is switched off
 * for this route in src/api/middlewares.ts; the Cooloff handler reads the raw
 * body itself to enforce its size limit and strict JSON content type.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  await getWithdrawalHandler(req.scope)(req, res);
}
