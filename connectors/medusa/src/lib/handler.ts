/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MedusaContainer } from '@medusajs/framework/types';
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils';
import {
  createWithdrawalHandler,
  MemoryRateLimiter,
  normaliseOrigin,
  type StoredWithdrawal,
  type WithdrawalHandler,
} from '@afkzona/cooloff/server';
import { adaptToNode, type NodeHandler } from '@afkzona/cooloff/node';

import { COOLOFF_MODULE } from '../modules/cooloff';
import type CooloffModuleService from '../modules/cooloff/service';
import { MedusaWithdrawalStore } from './medusa-store';

/** Event emitted for every new withdrawal. Carries IDs only, no personal data. */
export const WITHDRAWAL_RECEIVED_EVENT = 'cooloff.withdrawal.received';

/** Body limit for the store route, matched by the middleware. */
export const MAX_BODY_BYTES = 16 * 1024;

/** The Fetch API handler and its Node adapter, built once per plugin instance. */
interface Handlers {
  readonly core: WithdrawalHandler;
  readonly node: NodeHandler;
}

/**
 * Keyed by the module service, which Medusa creates once per application.
 * Not by `req.scope`: Medusa creates a new scope for every request, and a
 * handler per request would start with empty rate limiters every time.
 */
const handlers = new WeakMap<object, Handlers>();

/** Plain (non-regex) origins from Medusa's `storeCors` setting, normalised. */
export function originsFromStoreCors(storeCors: unknown): string[] {
  if (typeof storeCors !== 'string') return [];
  const origins: string[] = [];
  for (const entry of storeCors.split(',').map((part) => part.trim())) {
    if (!/^https?:\/\/[^/]+\/?$/u.test(entry)) continue;
    try {
      origins.push(normaliseOrigin(entry));
    } catch {
      // Not a plain origin; Medusa treats it as a pattern.
    }
  }
  return origins;
}

interface OrderRow {
  id: string;
  email?: string | null;
}

/**
 * Builds (once per application) the Node handler for the store route: the
 * Cooloff Fetch API handler with a PostgreSQL store, the Medusa Notification
 * Module as notifier and the plugin options.
 */
export function getWithdrawalHandler(container: MedusaContainer): NodeHandler {
  return getHandlers(container).node;
}

/** The Fetch API handler, for the scheduled retry of pending acknowledgements. */
export function getWithdrawalCoreHandler(container: MedusaContainer): WithdrawalHandler {
  return getHandlers(container).core;
}

function getHandlers(container: MedusaContainer): Handlers {
  const service = container.resolve<CooloffModuleService>(COOLOFF_MODULE);
  const cached = handlers.get(service);
  if (cached !== undefined) return cached;

  const options = service.getOptions();
  const config = container.resolve<{ projectConfig: { http: { storeCors?: string } } }>(
    ContainerRegistrationKeys.CONFIG_MODULE,
  );
  const logger = container.resolve<{ error: (message: string) => void }>(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve<{
    graph: (input: { entity: string; fields: string[]; filters: Record<string, unknown> }) => Promise<{ data: OrderRow[] }>;
  }>(ContainerRegistrationKeys.QUERY);

  const secret = process.env['COOLOFF_SECRET'];
  if (secret === undefined) throw new Error('Set the COOLOFF_SECRET environment variable (at least 32 bytes)');
  if (typeof options.traderName !== 'string' || typeof options.timeZone !== 'string') {
    throw new Error('Cooloff plugin options traderName and timeZone are required');
  }

  /** Links the withdrawal to an order when the display ID and e-mail match. */
  const findOrderId = async (record: StoredWithdrawal): Promise<string | null> => {
    const number = record.statement.contract.replace(/^#/u, '').trim();
    if (!/^\d{1,9}$/u.test(number)) return null;
    const { data } = await query.graph({ entity: 'order', fields: ['id', 'email'], filters: { display_id: Number(number) } });
    const order = data[0];
    return order !== undefined && typeof order.email === 'string' && order.email.toLowerCase() === record.statement.email.toLowerCase()
      ? order.id
      : null;
  };
  const store = new MedusaWithdrawalStore(service, findOrderId);

  const handler = createWithdrawalHandler({
    secret,
    trader: { name: options.traderName, timeZone: options.timeZone },
    allowedOrigins: options.allowedOrigins ?? originsFromStoreCors(config.projectConfig.http.storeCors),
    store,
    allowPartial: options.allowPartial === true,
    rateLimiter: new MemoryRateLimiter({ limit: options.rateLimitPerMinute ?? 10 }),
    maxBodyBytes: MAX_BODY_BYTES,
    notifier: {
      async send(email, ack) {
        const notification = container.resolve<{
          createNotifications: (input: Record<string, unknown>) => Promise<unknown>;
        }>(Modules.NOTIFICATION);
        await notification.createNotifications({
          to: email.to,
          channel: 'email',
          template: options.notificationTemplate ?? 'cooloff-withdrawal-acknowledgement',
          content: { subject: email.subject, text: email.text, html: email.html },
          data: { receipt_id: ack.receiptId, language: ack.language },
        });
      },
    },
    onWithdrawal: async (record) => {
      const ids = await store.ids(record.storageKey);
      const eventBus = container.resolve<{ emit: (event: { name: string; data: Record<string, unknown> }) => Promise<void> }>(
        Modules.EVENT_BUS,
      );
      await eventBus.emit({
        name: WITHDRAWAL_RECEIVED_EVENT,
        data: { id: ids?.id, receipt_id: record.receiptId, order_id: ids?.orderId ?? null },
      });
    },
    onError: (phase, error) => {
      logger.error(`[cooloff] ${phase} error: ${error instanceof Error ? error.name : typeof error}`);
    },
  });

  const node = adaptToNode(handler, MAX_BODY_BYTES, (req) => {
    const ip = (req as { ip?: string }).ip;
    return ip ?? req.socket.remoteAddress;
  });
  const built = { core: handler, node };
  handlers.set(service, built);
  return built;
}
