/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import { OFFICIAL_LABELS, type OfficialLabels, type OfficialLanguage } from './labels.js';
import { MESSAGE_CATALOGUES, type Messages } from './messages.js';

/** All supported languages: the 24 official EU languages. */
export const SUPPORTED_LANGUAGES: readonly OfficialLanguage[] = Object.freeze(
  OFFICIAL_LABELS.map((entry) => entry.language),
);

/** The default fallback language. */
export const DEFAULT_LANGUAGE: OfficialLanguage = 'en';

const LABELS_BY_LANGUAGE: ReadonlyMap<string, OfficialLabels> = new Map(
  OFFICIAL_LABELS.map((entry) => [entry.language, entry]),
);

const MESSAGES_BY_LANGUAGE: ReadonlyMap<string, Messages> = new Map(
  MESSAGE_CATALOGUES.map((entry) => [entry.language, entry.messages]),
);

/** Maximum length of a language tag we look at. BCP 47 tags in practice are far shorter. */
const MAX_TAG_LENGTH = 35;

/**
 * Returns `true` if `value` is one of the 24 official EU language codes.
 *
 * @example
 * ```ts
 * isOfficialLanguage('lt'); // true
 * isOfficialLanguage('no'); // false
 * ```
 */
export function isOfficialLanguage(value: unknown): value is OfficialLanguage {
  return typeof value === 'string' && LABELS_BY_LANGUAGE.has(value);
}

/**
 * Reduces a BCP 47 language tag such as `de-AT` or `PT_br` to its primary
 * language subtag in lower case (`de`, `pt`). Returns `undefined` for anything
 * that is not a plausible tag.
 */
export function primaryLanguageSubtag(tag: string): string | undefined {
  if (tag.length === 0 || tag.length > MAX_TAG_LENGTH) return undefined;
  const primary = tag.trim().split(/[-_]/u)[0]?.toLowerCase();
  if (primary === undefined || !/^[a-z]{2,3}$/u.test(primary)) return undefined;
  return primary;
}

/** Result of resolving a requested language. */
export interface ResolvedLanguage {
  /** The language that will be used. */
  readonly language: OfficialLanguage;
  /** `true` if the requested language was not supported and the fallback was used. */
  readonly isFallback: boolean;
}

/**
 * Picks the language to use.
 *
 * Fallback rules, in order:
 * 1. Each requested tag is reduced to its primary subtag (`de-AT` → `de`).
 * 2. The first requested tag that is an official EU language wins.
 * 3. Otherwise `fallback` (default `en`) is used and `isFallback` is `true`.
 *
 * @example
 * ```ts
 * resolveLanguage(['de-AT', 'en']); // { language: 'de', isFallback: false }
 * resolveLanguage('nb-NO');         // { language: 'en', isFallback: true }
 * ```
 */
export function resolveLanguage(
  requested: string | readonly string[] | undefined,
  fallback: OfficialLanguage = DEFAULT_LANGUAGE,
): ResolvedLanguage {
  const tags = requested === undefined ? [] : typeof requested === 'string' ? [requested] : requested;
  for (const tag of tags) {
    const primary = primaryLanguageSubtag(tag);
    if (primary !== undefined && isOfficialLanguage(primary)) {
      return { language: primary, isFallback: false };
    }
  }
  return { language: fallback, isFallback: true };
}

/**
 * Returns the official labels for a language.
 *
 * The labels are always the official text of Directive (EU) 2023/2673 for the
 * resolved language. If the requested language is not an official EU language,
 * the fallback language's official labels are returned and `isFallback` is set.
 */
export function getOfficialLabels(
  requested: string | readonly string[] | undefined,
  fallback: OfficialLanguage = DEFAULT_LANGUAGE,
): OfficialLabels & { readonly isFallback: boolean } {
  const resolved = resolveLanguage(requested, fallback);
  const labels = LABELS_BY_LANGUAGE.get(resolved.language);
  /* c8 ignore next 3 -- every OfficialLanguage has labels; guarded by tests */
  if (labels === undefined) {
    throw new Error(`No official labels for ${resolved.language}`);
  }
  return { ...labels, isFallback: resolved.isFallback };
}

/**
 * Returns the interface strings for a language, merged with optional overrides.
 * The strings are working translations (`source: "translation"`), not official text.
 */
export function getMessages(
  requested: string | readonly string[] | undefined,
  overrides: Partial<Messages> = {},
  fallback: OfficialLanguage = DEFAULT_LANGUAGE,
): Messages & { readonly language: OfficialLanguage; readonly isFallback: boolean } {
  const resolved = resolveLanguage(requested, fallback);
  const base = MESSAGES_BY_LANGUAGE.get(resolved.language);
  /* c8 ignore next 3 -- every OfficialLanguage has messages; guarded by tests */
  if (base === undefined) {
    throw new Error(`No messages for ${resolved.language}`);
  }
  const merged: Record<string, string> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (Object.hasOwn(base, key) && typeof value === 'string') merged[key] = value;
  }
  return { ...(merged as unknown as Messages), language: resolved.language, isFallback: resolved.isFallback };
}

/**
 * Replaces `{name}` placeholders with values. Unknown placeholders are left as
 * they are. The output is plain text and must be rendered as text.
 *
 * @example
 * ```ts
 * interpolate('Sent to {email}.', { email: 'a@b.eu' }); // 'Sent to a@b.eu.'
 * ```
 */
export function interpolate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{([a-z]+)\}/gu, (match, name: string) =>
    Object.hasOwn(values, name) ? (values[name] ?? match) : match,
  );
}

/**
 * Upper-cases the first character of an official label for display on a
 * button (`withdraw from contract here` → `Withdraw from contract here`).
 * The words are unchanged.
 */
export function sentenceCase(text: string, language: string): string {
  const first = text.codePointAt(0);
  if (first === undefined) return text;
  const head = String.fromCodePoint(first);
  return head.toLocaleUpperCase(language) + text.slice(head.length);
}
