import { describe, expect, it } from 'vitest';

import {
  getMessages,
  getOfficialLabels,
  interpolate,
  isOfficialLanguage,
  primaryLanguageSubtag,
  resolveLanguage,
  sentenceCase,
  SUPPORTED_LANGUAGES,
} from '../src/core/i18n.js';

describe('language resolution', () => {
  it('lists 24 languages', () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(24);
  });

  it('recognises official codes only', () => {
    expect(isOfficialLanguage('lt')).toBe(true);
    expect(isOfficialLanguage('LT')).toBe(false);
    expect(isOfficialLanguage('no')).toBe(false);
    expect(isOfficialLanguage(5)).toBe(false);
  });

  it('reduces tags to the primary subtag', () => {
    expect(primaryLanguageSubtag('de-AT')).toBe('de');
    expect(primaryLanguageSubtag('PT_br')).toBe('pt');
    expect(primaryLanguageSubtag(' sv ')).toBe('sv');
    expect(primaryLanguageSubtag('')).toBeUndefined();
    expect(primaryLanguageSubtag('x'.repeat(40))).toBeUndefined();
    expect(primaryLanguageSubtag('1e')).toBeUndefined();
  });

  it('takes the first supported tag', () => {
    expect(resolveLanguage(['nb-NO', 'de-AT', 'fr'])).toEqual({ language: 'de', isFallback: false });
  });

  it('falls back to English, or to the given fallback', () => {
    expect(resolveLanguage('nb-NO')).toEqual({ language: 'en', isFallback: true });
    expect(resolveLanguage(undefined, 'lt')).toEqual({ language: 'lt', isFallback: true });
    expect(resolveLanguage([], 'de')).toEqual({ language: 'de', isFallback: true });
  });

  it('returns official labels with the fallback flag', () => {
    expect(getOfficialLabels('fr-BE').withdrawLabel).toBe('renoncer au contrat ici');
    expect(getOfficialLabels('fr-BE').isFallback).toBe(false);
    const fallback = getOfficialLabels('is');
    expect(fallback.language).toBe('en');
    expect(fallback.isFallback).toBe(true);
  });
});

describe('messages', () => {
  it('merges known overrides and ignores unknown keys', () => {
    const overrides = { cancel: 'Back', unknownKey: 'x' } as unknown as Record<string, string>;
    const m = getMessages('en', overrides);
    expect(m.cancel).toBe('Back');
    expect((m as unknown as Record<string, unknown>)['unknownKey']).toBeUndefined();
    expect(m.language).toBe('en');
  });

  it('ignores non-string overrides', () => {
    const m = getMessages('en', { cancel: 5 } as unknown as Record<string, string>);
    expect(m.cancel).toBe('Cancel');
  });

  it('flags fallback', () => {
    expect(getMessages('zz').isFallback).toBe(true);
  });
});

describe('interpolate', () => {
  it('replaces known placeholders once and leaves unknown ones', () => {
    expect(interpolate('To {email} {other}', { email: '{other}' })).toBe('To {other} {other}');
  });

  it('does not read inherited properties', () => {
    expect(interpolate('{constructor}', {})).toBe('{constructor}');
  });
});

describe('sentenceCase', () => {
  it('upper-cases only the first character', () => {
    expect(sentenceCase('withdraw from contract here', 'en')).toBe('Withdraw from contract here');
    expect(sentenceCase('ångra avtalet här', 'sv')).toBe('Ångra avtalet här');
    expect(sentenceCase('Vertrag widerrufen', 'de')).toBe('Vertrag widerrufen');
    expect(sentenceCase('', 'en')).toBe('');
  });
});
