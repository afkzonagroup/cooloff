/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Acknowledgement } from './acknowledgement.js';

/** A rendered e-mail. Hand it to your own mail transport. */
export interface RenderedEmail {
  /** Recipient: the address the consumer gave or confirmed (Art. 11a(2)(c)). */
  readonly to: string;
  /** Subject line. Never contains line breaks. */
  readonly subject: string;
  /** Plain-text body. */
  readonly text: string;
  /** HTML body. Every dynamic value is HTML-escaped. */
  readonly html: string;
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapes text for use in HTML element content and in quoted attribute values.
 *
 * @example
 * ```ts
 * escapeHtml('<script>"x"</script>'); // '&lt;script&gt;&quot;x&quot;&lt;/script&gt;'
 * ```
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (char) => HTML_ESCAPES[char] ?? char);
}

/** Removes anything that could break a mail header and caps the length. */
export function safeHeaderValue(value: string, maxLength = 200): string {
  // eslint-disable-next-line no-control-regex -- removing control characters is the purpose of this pattern
  const single = value.replace(/[\u{0}-\u{1F}\u{7F}-\u{9F}\u{2028}\u{2029}]+/gu, ' ').trim();
  return single.length > maxLength ? single.slice(0, maxLength) : single;
}

/**
 * Renders the acknowledgement of receipt as an e-mail (subject, text and
 * HTML). E-mail is one durable medium in the sense of Article 2(10) of
 * Directive 2011/83/EU; the model instructions in Annex I(A) name e-mail as an
 * example. This package ships no mail client: pass the result to your own.
 *
 * @example
 * ```ts
 * const email = renderAcknowledgementEmail(ack);
 * await transport.send({ to: email.to, subject: email.subject, text: email.text, html: email.html });
 * ```
 */
export function renderAcknowledgementEmail(ack: Acknowledgement): RenderedEmail {
  const { texts } = ack;
  const text = [
    texts.intro,
    '',
    texts.statementText,
    '',
    ...texts.lines.map((line) => `${line.label}: ${line.value}`),
    '',
  ].join('\n');

  const rows = texts.lines
    .map(
      (line) =>
        `<tr><th scope="row" style="text-align:left;vertical-align:top;padding:4px 16px 4px 0;font-weight:600">${escapeHtml(line.label)}</th><td style="padding:4px 0">${escapeHtml(line.value)}</td></tr>`,
    )
    .join('');

  const html =
    `<!doctype html><html lang="${escapeHtml(ack.language)}"><head><meta charset="utf-8">` +
    `<title>${escapeHtml(texts.subject)}</title></head>` +
    `<body style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:16px;line-height:1.5;color:#111;background:#fff;margin:0;padding:24px">` +
    `<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(texts.title)}</h1>` +
    `<p style="margin:0 0 16px">${escapeHtml(texts.intro)}</p>` +
    `<p style="margin:0 0 16px;font-weight:600">${escapeHtml(texts.statementText)}</p>` +
    `<table role="presentation" style="border-collapse:collapse">${rows}</table>` +
    `</body></html>`;

  return Object.freeze({
    to: ack.statement.email,
    subject: safeHeaderValue(texts.subject),
    text,
    html,
  });
}
