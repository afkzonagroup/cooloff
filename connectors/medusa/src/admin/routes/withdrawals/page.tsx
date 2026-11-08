/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineRouteConfig } from '@medusajs/admin-sdk';
import { ArrowUturnLeft } from '@medusajs/icons';
import { Container, Heading, Table, Text } from '@medusajs/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { itemsText, sdk, utcText, type WithdrawalList } from '../../lib/sdk';

const PAGE_SIZE = 50;

/** Settings > Withdrawals: every withdrawal received through the withdrawal function. */
const WithdrawalsPage = () => {
  const [pageIndex, setPageIndex] = useState(0);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['cooloff-withdrawals', pageIndex],
    queryFn: () =>
      sdk.client.fetch<WithdrawalList>('/admin/cooloff/withdrawals', {
        query: { limit: PAGE_SIZE, offset: pageIndex * PAGE_SIZE },
      }),
  });
  const rows = data?.withdrawals ?? [];
  const count = data?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h1">Withdrawals</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Received through the withdrawal function (Article 11a of Directive 2011/83/EU).
        </Text>
      </div>
      {isError ? (
        <Text className="px-6 py-4">The withdrawals could not be loaded.</Text>
      ) : (
        <>
          <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Receipt</Table.HeaderCell>
                <Table.HeaderCell>Submitted</Table.HeaderCell>
                <Table.HeaderCell>Name</Table.HeaderCell>
                <Table.HeaderCell>Contract</Table.HeaderCell>
                <Table.HeaderCell>Email</Table.HeaderCell>
                <Table.HeaderCell>Items</Table.HeaderCell>
                <Table.HeaderCell>Acknowledged</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rows.map((row) => (
                <Table.Row key={row.id}>
                  <Table.Cell className="whitespace-nowrap">{row.receipt_id}</Table.Cell>
                  <Table.Cell className="whitespace-nowrap">{utcText(row.submitted_at)}</Table.Cell>
                  <Table.Cell>{row.name}</Table.Cell>
                  <Table.Cell>{row.contract}</Table.Cell>
                  <Table.Cell>{row.email}</Table.Cell>
                  <Table.Cell>{itemsText(row.items)}</Table.Cell>
                  <Table.Cell className="whitespace-nowrap">{utcText(row.acknowledged_at)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
          </div>
          {!isLoading && rows.length === 0 && <Text className="px-6 py-4">No withdrawals yet.</Text>}
          <Table.Pagination
            count={count}
            pageSize={PAGE_SIZE}
            pageIndex={pageIndex}
            pageCount={pageCount}
            canPreviousPage={pageIndex > 0}
            canNextPage={pageIndex + 1 < pageCount}
            previousPage={() => {
              setPageIndex((p) => Math.max(0, p - 1));
            }}
            nextPage={() => {
              setPageIndex((p) => p + 1);
            }}
          />
        </>
      )}
    </Container>
  );
};

export const config = defineRouteConfig({
  label: 'Withdrawals',
  icon: ArrowUturnLeft,
});

export default WithdrawalsPage;
