/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MedusaContainer } from '@medusajs/framework/types';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';

import { getWithdrawalCoreHandler } from '../lib/handler';

/**
 * Sends acknowledgements of receipt that are still pending (the notification
 * failed or the recipient limit held them back), so Article 11a(4) is met
 * without a new submission from the consumer.
 */
export default async function cooloffRetryAcknowledgements(container: MedusaContainer): Promise<void> {
  try {
    await getWithdrawalCoreHandler(container).retryPendingAcknowledgements();
  } catch (error) {
    const logger = container.resolve<{ error: (message: string) => void }>(ContainerRegistrationKeys.LOGGER);
    logger.error(`[cooloff] retry error: ${error instanceof Error ? error.name : typeof error}`);
  }
}

export const config = {
  name: 'cooloff-retry-acknowledgements',
  schedule: '*/15 * * * *',
};
