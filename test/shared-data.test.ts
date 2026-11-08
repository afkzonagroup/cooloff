import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildAcknowledgement } from '../src/core/acknowledgement.js';
import { renderAcknowledgementEmail } from '../src/core/email.js';
import { MESSAGE_CATALOGUES } from '../src/core/messages.js';
import { canonicalRequest, computeReceiptId, idempotencyStorageKey } from '../src/core/receipt.js';
import type { WithdrawalRequest } from '../src/core/schema.js';

function load(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
}

describe('shared data files for other implementations', () => {
  it('data/messages.json matches the TypeScript catalogues', () => {
    const json = load('messages.json') as { catalogues: unknown };
    expect(json.catalogues).toEqual(JSON.parse(JSON.stringify(MESSAGE_CATALOGUES)));
  });

  const file = load('test-vectors.json') as {
    secret: string;
    submittedAt: string;
    trader: { name: string; timeZone: string };
    vectors: Array<{
      input: WithdrawalRequest;
      canonical: string;
      receiptId: string;
      storageKey: string;
      acknowledgement: { subject: string; lines: unknown; text: string };
    }>;
  };

  it.each(file.vectors.map((v, i) => [i, v] as const))('vector %i reproduces', async (_i, vector) => {
    expect(canonicalRequest(vector.input)).toBe(vector.canonical);
    expect(await computeReceiptId(file.secret, vector.input)).toBe(vector.receiptId);
    expect(await idempotencyStorageKey(file.secret, vector.input.idempotencyKey)).toBe(vector.storageKey);
    const { idempotencyKey: _key, ...statement } = vector.input;
    const ack = buildAcknowledgement({
      statement,
      receiptId: vector.receiptId,
      submittedAt: new Date(file.submittedAt),
      trader: file.trader,
    });
    expect(ack.texts.subject).toBe(vector.acknowledgement.subject);
    expect(ack.texts.lines).toEqual(vector.acknowledgement.lines);
    expect(renderAcknowledgementEmail(ack).text).toBe(vector.acknowledgement.text);
  });
});
