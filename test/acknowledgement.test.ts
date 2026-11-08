import { describe, expect, it } from 'vitest';

import { buildAcknowledgement } from '../src/core/acknowledgement.js';
import { escapeHtml, renderAcknowledgementEmail, safeHeaderValue } from '../src/core/email.js';
import type { WithdrawalStatement } from '../src/core/schema.js';
import { XSS_PAYLOADS } from './fixtures.js';

const statement: WithdrawalStatement = {
  name: 'Jane Doe',
  contract: 'ORDER-1001',
  email: 'jane@example.eu',
  items: [],
  language: 'en',
};
const trader = { name: 'Example Shop', timeZone: 'Europe/Vilnius' };
const submittedAt = new Date('2026-06-19T08:30:00.000Z');

describe('buildAcknowledgement (Art. 11a(4))', () => {
  const ack = buildAcknowledgement({ statement, receiptId: 'WD-AAAA-BBBB-CCCC-DDDD', submittedAt, trader });
  const values = ack.texts.lines.map((line) => line.value);

  it('contains the content of the withdrawal statement', () => {
    expect(ack.texts.statementText).toBe('I withdraw from the contract identified below.');
    expect(values).toContain('Jane Doe');
    expect(values).toContain('ORDER-1001');
    expect(values).toContain('jane@example.eu');
    expect(values).toContain('Whole contract');
    expect(ack.statement).toBe(statement);
  });

  it('contains the date and time of submission in the shop time zone and in UTC', () => {
    expect(ack.submittedAt.utc).toBe('2026-06-19T08:30:00.000Z');
    expect(ack.submittedAt.local).toBe('2026-06-19T11:30:00+03:00');
    expect(values).toContain('2026-06-19 11:30:00 (Europe/Vilnius, UTC+03:00)');
    expect(values).toContain('2026-06-19 08:30:00 UTC');
  });

  it('contains the trader and the receipt number', () => {
    expect(values).toContain('Example Shop');
    expect(values).toContain('WD-AAAA-BBBB-CCCC-DDDD');
    expect(ack.texts.subject).toBe('Acknowledgement of receipt of your withdrawal WD-AAAA-BBBB-CCCC-DDDD');
  });

  it('lists items for a partial withdrawal', () => {
    const partial = buildAcknowledgement({
      statement: { ...statement, items: ['Shoes', 'Hat'] },
      receiptId: 'WD-1',
      submittedAt,
      trader,
    });
    expect(partial.texts.lines.find((l) => l.label === 'Items')?.value).toBe('Shoes; Hat');
  });

  it('uses the statement language and message overrides', () => {
    const de = buildAcknowledgement({
      statement: { ...statement, language: 'de' },
      receiptId: 'WD-1',
      submittedAt,
      trader,
      messages: { traderLabel: 'Händler' },
    });
    expect(de.language).toBe('de');
    expect(de.texts.subject).toBe('Eingangsbestätigung Ihres Widerrufs WD-1');
    expect(de.texts.lines[0]?.label).toBe('Händler');
  });

  it('is pure', () => {
    const again = buildAcknowledgement({ statement, receiptId: 'WD-AAAA-BBBB-CCCC-DDDD', submittedAt, trader });
    expect(again).toEqual(ack);
  });

  it('refuses an unknown time zone', () => {
    expect(() =>
      buildAcknowledgement({ statement, receiptId: 'x', submittedAt, trader: { name: 'x', timeZone: 'Nope/Nope' } }),
    ).toThrow(RangeError);
  });
});

describe('renderAcknowledgementEmail', () => {
  it('renders subject, text and HTML for the consumer address', () => {
    const ack = buildAcknowledgement({ statement, receiptId: 'WD-1', submittedAt, trader });
    const email = renderAcknowledgementEmail(ack);
    expect(email.to).toBe('jane@example.eu');
    expect(email.subject).toBe('Acknowledgement of receipt of your withdrawal WD-1');
    expect(email.text).toContain('Name: Jane Doe');
    expect(email.text).toContain('Date and time of submission: 2026-06-19 11:30:00 (Europe/Vilnius, UTC+03:00)');
    expect(email.text).toContain('Date and time of submission (UTC): 2026-06-19 08:30:00 UTC');
    expect(email.html).toContain('<html lang="en">');
    expect(email.html).toContain('<td style="padding:4px 0">ORDER-1001</td>');
  });

  it.each(XSS_PAYLOADS)('escapes %s in every field', (payload) => {
    const ack = buildAcknowledgement({
      statement: { name: payload, contract: payload, email: 'jane@example.eu', items: [payload], language: 'en' },
      receiptId: payload,
      submittedAt,
      trader: { name: payload, timeZone: 'UTC' },
      messages: { emailIntro: payload, statementText: payload, emailSubject: payload },
    });
    const { html, subject, text } = renderAcknowledgementEmail(ack);
    expect(html).not.toContain(payload.includes('<') ? payload : '\u{0}');
    expect(html).not.toMatch(/<script|<img|<svg|<a /iu);
    expect(html).toContain(escapeHtml(payload));
    expect(subject).not.toMatch(/[\r\n]/u);
    expect(text).toContain(payload);
  });

  it('escapes all five HTML-special characters', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('removes line breaks from header values and caps length', () => {
    expect(safeHeaderValue('a\r\nBcc: x@y.eu')).toBe('a Bcc: x@y.eu');
    expect(safeHeaderValue('x'.repeat(300))).toHaveLength(200);
    expect(safeHeaderValue(`a${String.fromCodePoint(0x2028)}b`)).toBe('a b');
  });
});
