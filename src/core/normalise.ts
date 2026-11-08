/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * C0 and C1 control characters, DEL, and Unicode format characters that can
 * change how text is displayed: bidirectional embeddings, overrides and
 * isolates, zero-width characters, the byte order mark, and line/paragraph
 * separators. They have no place in a name, an order number or an e-mail
 * address, and they can be used to make an acknowledgement look different
 * from what was stored.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the purpose of this pattern
const UNSAFE_CHARACTERS = /[\u{0}-\u{1F}\u{7F}-\u{9F}\u{AD}\u{61C}\u{180E}\u{200B}-\u{200F}\u{2028}-\u{202E}\u{2060}-\u{2064}\u{2066}-\u{206F}\u{FEFF}\u{FFF9}-\u{FFFB}]/gu;

/** Non-global copy for tests, so no `lastIndex` state is shared between calls. */
const UNSAFE_CHARACTER = new RegExp(UNSAFE_CHARACTERS.source, 'u');

/** Returns `true` if the text contains any character removed by {@link normaliseText}. */
export function hasUnsafeCharacters(text: string): boolean {
  return UNSAFE_CHARACTER.test(text);
}

/**
 * Normalises a single-line text value:
 * Unicode NFC, unsafe characters (controls, bidi overrides, zero-width
 * characters) replaced by a space, runs of white space collapsed to one
 * space, and leading/trailing white space removed.
 *
 * @example
 * ```ts
 * normaliseText('  Jane\u{202E}  Doe \n'); // 'Jane Doe'
 * ```
 */
export function normaliseText(value: string): string {
  return value.normalize('NFC').replace(UNSAFE_CHARACTERS, ' ').replace(/\s+/gu, ' ').trim();
}

/**
 * Normalises an e-mail address: trimmed, NFC, and the domain part in lower
 * case. The local part is kept as typed because it can be case-sensitive.
 * Unsafe characters are not removed here; validation rejects them.
 */
export function normaliseEmail(value: string): string {
  const trimmed = value.normalize('NFC').trim();
  const at = trimmed.lastIndexOf('@');
  if (at < 0) return trimmed;
  return trimmed.slice(0, at) + '@' + trimmed.slice(at + 1).toLowerCase();
}
