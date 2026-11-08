/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import { getMessages, interpolate } from './i18n.js';
import type { OfficialLanguage } from './labels.js';
import type { Messages } from './messages.js';
import { normaliseText } from './normalise.js';
import type { WithdrawalStatement } from './schema.js';
import { formatZoned, type ZonedTimestamp } from './time.js';

/** Trader details shown in the acknowledgement. Configuration, not user input. */
export interface TraderInfo {
  /** Trader name as shown to consumers. */
  readonly name: string;
  /** IANA time zone of the shop, e.g. `Europe/Vilnius`. Used next to UTC. */
  readonly timeZone: string;
}

/** One labelled line of the acknowledgement. */
export interface AcknowledgementLine {
  readonly label: string;
  readonly value: string;
}

/**
 * The acknowledgement of receipt of Article 11a(4) of Directive 2011/83/EU:
 * the content of the withdrawal statement and the date and time of its
 * submission, plus a receipt number.
 */
export interface Acknowledgement {
  /** Deterministic receipt ID, see `computeReceiptId`. */
  readonly receiptId: string;
  /** Language of the texts. */
  readonly language: OfficialLanguage;
  /** Trader name. */
  readonly traderName: string;
  /** The withdrawal statement as received (Art. 11a(4) "its content"). */
  readonly statement: WithdrawalStatement;
  /** Date and time of submission in UTC and in the shop's time zone (Art. 11a(4)). */
  readonly submittedAt: ZonedTimestamp;
  /** Ready-to-render texts. Plain text only. */
  readonly texts: {
    readonly subject: string;
    readonly title: string;
    readonly intro: string;
    readonly statementText: string;
    readonly lines: readonly AcknowledgementLine[];
  };
}

/** Input of {@link buildAcknowledgement}. */
export interface AcknowledgementInput {
  readonly statement: WithdrawalStatement;
  readonly receiptId: string;
  /** The instant the server received the confirmed statement. */
  readonly submittedAt: Date;
  readonly trader: TraderInfo;
  /** Optional overrides of the interface strings. */
  readonly messages?: Partial<Messages>;
}

/** Writes `2026-06-19T11:30:00+03:00` as `2026-06-19 11:30:00`. */
function wallClock(isoLocal: string): string {
  return isoLocal.slice(0, 10) + ' ' + isoLocal.slice(11, 19);
}

/**
 * Builds the acknowledgement of receipt. Pure: the same input always gives
 * the same output.
 *
 * The acknowledgement contains:
 * - the statement sentence and every field the consumer provided or
 *   confirmed (name, contract, e-mail, items or "whole contract");
 * - the date and time of submission in the shop's time zone and in UTC;
 * - the trader name and the receipt number.
 *
 * @throws RangeError if `trader.timeZone` is unknown or `submittedAt` is invalid.
 *
 * @example
 * ```ts
 * const ack = buildAcknowledgement({
 *   statement, receiptId: 'WD-0000-0000-0000-0000',
 *   submittedAt: new Date('2026-06-19T08:30:00Z'),
 *   trader: { name: 'Example Shop', timeZone: 'Europe/Vilnius' },
 * });
 * ack.submittedAt.local; // '2026-06-19T11:30:00+03:00'
 * ```
 */
export function buildAcknowledgement(input: AcknowledgementInput): Acknowledgement {
  const { statement, receiptId, trader } = input;
  const submittedAt = formatZoned(input.submittedAt, trader.timeZone);
  const m = getMessages(statement.language, input.messages ?? {});
  const traderName = normaliseText(trader.name);
  const lines: AcknowledgementLine[] = [
    { label: m.traderLabel, value: traderName },
    { label: m.nameLabel, value: statement.name },
    { label: m.contractLabel, value: statement.contract },
    { label: m.emailLabel, value: statement.email },
    {
      label: m.itemsField,
      value: statement.items.length === 0 ? m.wholeContract : statement.items.join('; '),
    },
    {
      label: m.submittedAtLabel,
      value: `${wallClock(submittedAt.local)} (${submittedAt.timeZone}, UTC${submittedAt.offset})`,
    },
    { label: `${m.submittedAtLabel} (UTC)`, value: `${wallClock(submittedAt.utc)} UTC` },
    { label: m.receiptLabel, value: receiptId },
  ];
  return Object.freeze({
    receiptId,
    language: m.language,
    traderName,
    statement,
    submittedAt,
    texts: Object.freeze({
      subject: interpolate(m.emailSubject, { receipt: receiptId }),
      title: m.successTitle,
      intro: m.emailIntro,
      statementText: m.statementText,
      lines: Object.freeze(lines.map((line) => Object.freeze(line))),
    }),
  });
}
