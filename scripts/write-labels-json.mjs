// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: Apache-2.0
//
// Writes the shared data files from the compiled TypeScript, for connectors in
// other languages (PHP). Run `npm run labels:json`. Tests check that the files
// match the TypeScript sources.
//
// - data/labels.json        official labels (source: "official")
// - data/messages.json      interface strings (source: "translation")
// - data/test-vectors.json  receipt IDs and acknowledgement lines that every
//                           implementation must reproduce

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const core = await import('../dist/core/index.js');

async function write(name, data) {
  const target = fileURLToPath(new URL(`../data/${name}`, import.meta.url));
  await writeFile(target, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`Wrote data/${name}`);
}

await write('labels.json', {
  description:
    'Labels prescribed by Article 11a(1) and (3) of Directive 2011/83/EU as inserted by Directive (EU) 2023/2673, verbatim from each official language version on EUR-Lex.',
  directive: core.DIRECTIVE_2023_2673_ELI,
  labels: core.OFFICIAL_LABELS,
});

await write('messages.json', {
  description:
    'Interface strings that the law does not prescribe. Working translations, not official text. Need native review.',
  catalogues: core.MESSAGE_CATALOGUES,
});

const secret = 'test-vector-secret-not-for-production-use-0123456789';
const base = {
  name: 'Jane Doe',
  contract: 'ORDER-1001',
  email: 'jane@example.eu',
  items: [],
  language: 'en',
  idempotencyKey: 'k_0123456789abcdef',
};
const inputs = [
  base,
  { ...base, language: 'de', name: 'Jürgen Müller', contract: 'Bestellung 42/2026' },
  { ...base, language: 'lt', name: 'Žydrūnė Šiaulienė', items: ['Batai, 42 dydis', 'Striukė "M"'] },
  { ...base, language: 'el', name: 'Γιώργος Παπαδόπουλος', contract: 'Π-77', email: 'giorgos@example.gr' },
  { ...base, name: 'O\'Brien <b>&</b> \\ / "quoted"', contract: 'A/B\\C', idempotencyKey: 'k_ZZZZZZZZZZZZZZZZZZZZ_-' },
];
const submittedAt = new Date('2026-06-19T08:30:00.000Z');
const trader = { name: 'Example Shop', timeZone: 'Europe/Vilnius' };
const vectors = [];
for (const input of inputs) {
  const receiptId = await core.computeReceiptId(secret, input);
  const storageKey = await core.idempotencyStorageKey(secret, input.idempotencyKey);
  const { idempotencyKey: _key, ...statement } = input;
  const ack = core.buildAcknowledgement({ statement, receiptId, submittedAt, trader });
  const email = core.renderAcknowledgementEmail(ack);
  vectors.push({
    input,
    canonical: core.canonicalRequest(input),
    receiptId,
    storageKey,
    acknowledgement: { subject: ack.texts.subject, lines: ack.texts.lines, text: email.text },
  });
}
await write('test-vectors.json', {
  description: 'Shared test vectors. Every implementation must produce the same values.',
  secret,
  submittedAt: submittedAt.toISOString(),
  trader,
  vectors,
});
