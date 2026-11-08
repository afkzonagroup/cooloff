/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineWidgetConfig } from '@medusajs/admin-sdk';
import type { AdminOrder, DetailWidgetProps } from '@medusajs/framework/types';
import { Container, Heading, Text } from '@medusajs/ui';
import { useQuery } from '@tanstack/react-query';

import { itemsText, sdk, utcText, type WithdrawalList } from '../lib/sdk';

/** Shows withdrawals linked to the order (same order number and e-mail). */
const OrderWithdrawals = ({ data: order }: DetailWidgetProps<AdminOrder>) => {
  const { data } = useQuery({
    queryKey: ['cooloff-withdrawals', 'order', order.id],
    queryFn: () => sdk.client.fetch<WithdrawalList>('/admin/cooloff/withdrawals', { query: { order_id: order.id } }),
  });
  const rows = data?.withdrawals ?? [];
  if (rows.length === 0) return null;
  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">Withdrawal received</Heading>
      </div>
      {rows.map((row) => (
        <div key={row.id} className="px-6 py-4">
          <Text size="small" weight="plus">
            {row.receipt_id}
          </Text>
          <Text size="small">Submitted {utcText(row.submitted_at)}</Text>
          <Text size="small">{itemsText(row.items)}</Text>
          <Text size="small" className="text-ui-fg-subtle">
            Acknowledgement: {utcText(row.acknowledged_at)}
          </Text>
        </div>
      ))}
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: 'order.details.side.before',
});

export default OrderWithdrawals;
