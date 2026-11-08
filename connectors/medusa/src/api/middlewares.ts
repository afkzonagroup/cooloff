/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineMiddlewares } from '@medusajs/framework/http';

export default defineMiddlewares({
  routes: [
    {
      // Cooloff reads and limits the raw body itself (strict JSON, 16 KiB).
      matcher: '/store/cooloff/withdrawals',
      methods: ['POST'],
      bodyParser: false,
    },
  ],
});
