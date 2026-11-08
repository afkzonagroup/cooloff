/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';

import { COOLOFF_MODULE } from '../../../../modules/cooloff';
import type CooloffModuleService from '../../../../modules/cooloff/service';

/**
 * GET /admin/cooloff/withdrawals: newest first, `limit` (1-100, default 50)
 * and `offset`, optional `order_id`. Admin authentication is applied by Medusa to /admin routes.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const service = req.scope.resolve<CooloffModuleService>(COOLOFF_MODULE);
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query['limit'] ?? '50'), 10) || 50));
  const offset = Math.max(0, Number.parseInt(String(req.query['offset'] ?? '0'), 10) || 0);
  const orderId = req.query['order_id'];
  const filters = typeof orderId === 'string' && /^[A-Za-z0-9_]{1,64}$/u.test(orderId) ? { order_id: orderId } : {};
  const [withdrawals, count] = await service.listAndCountWithdrawals(filters, {
    take: limit,
    skip: offset,
    order: { submitted_at: 'DESC' },
  });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ withdrawals, count, limit, offset });
}
