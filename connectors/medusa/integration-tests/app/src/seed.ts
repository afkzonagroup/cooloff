/**
 * Seed for the end-to-end test: a publishable API key linked to a sales
 * channel, a region and one order. Writes the key and order number as JSON
 * to the path in SEED_OUTPUT.
 */
import { writeFileSync } from 'node:fs';

import type { ExecArgs } from '@medusajs/framework/types';
import {
  createApiKeysWorkflow,
  createOrderWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from '@medusajs/medusa/core-flows';

export default async function seed({ container }: ExecArgs): Promise<void> {
  const { result: channels } = await createSalesChannelsWorkflow(container).run({
    input: { salesChannelsData: [{ name: 'Web' }] },
  });
  const channel = channels[0];
  if (channel === undefined) throw new Error('no sales channel');
  const { result: keys } = await createApiKeysWorkflow(container).run({
    input: { api_keys: [{ title: 'Storefront', type: 'publishable', created_by: '' }] },
  });
  const key = keys[0];
  if (key === undefined) throw new Error('no api key');
  await linkSalesChannelsToApiKeyWorkflow(container).run({ input: { id: key.id, add: [channel.id] } });
  const { result: regions } = await createRegionsWorkflow(container).run({
    input: { regions: [{ name: 'Europe', currency_code: 'eur', countries: ['lt'] }] },
  });
  const region = regions[0];
  if (region === undefined) throw new Error('no region');
  const { result: order } = await createOrderWorkflow(container).run({
    input: {
      region_id: region.id,
      sales_channel_id: channel.id,
      email: 'jane@example.eu',
      currency_code: 'eur',
      items: [{ title: 'Running shoes', quantity: 1, unit_price: 80 }],
    },
  });
  writeFileSync(process.env['SEED_OUTPUT'] ?? 'seed.json', JSON.stringify({ publishableKey: key.token, orderDisplayId: order.display_id, orderId: order.id }));
}
