import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { DIRECTIVE_2023_2673_ELI, OFFICIAL_LABELS } from '../src/core/labels.js';
import { MESSAGE_CATALOGUES, type Messages } from '../src/core/messages.js';

const EU_LANGUAGES = ['bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fi', 'fr', 'ga', 'hr', 'hu', 'it', 'lt', 'lv', 'mt', 'nl', 'pl', 'pt', 'ro', 'sk', 'sl', 'sv'];

describe('official labels (Art. 11a(1) and (3))', () => {
  it('covers exactly the 24 official EU languages', () => {
    expect(OFFICIAL_LABELS.map((l) => l.language).sort()).toEqual(EU_LANGUAGES);
  });

  it.each(OFFICIAL_LABELS.map((l) => [l.language, l] as const))('%s has both official labels', (_language, entry) => {
    expect(entry.source).toBe('official');
    expect(entry.withdrawLabel.trim()).toBe(entry.withdrawLabel);
    expect(entry.confirmLabel.trim()).toBe(entry.confirmLabel);
    expect(entry.withdrawLabel.length).toBeGreaterThan(3);
    expect(entry.confirmLabel.length).toBeGreaterThan(3);
    expect(entry.withdrawLabel).not.toBe(entry.confirmLabel);
    // Each label is quoted inside the official sentence it was taken from.
    expect(entry.withdrawSentence).toContain(entry.withdrawLabel);
    expect(entry.confirmSentence).toContain(entry.confirmLabel);
    expect(entry.url).toBe(
      `https://eur-lex.europa.eu/legal-content/${entry.language.toUpperCase()}/TXT/HTML/?uri=CELEX:32023L2673`,
    );
  });

  it('has the English wording of the Official Journal', () => {
    const en = OFFICIAL_LABELS.find((l) => l.language === 'en');
    expect(en?.withdrawLabel).toBe('withdraw from contract here');
    expect(en?.confirmLabel).toBe('confirm withdrawal');
  });

  it('spot-checks other language versions', () => {
    const get = (language: string) => OFFICIAL_LABELS.find((l) => l.language === language);
    expect(get('de')?.withdrawLabel).toBe('Vertrag widerrufen');
    expect(get('de')?.confirmLabel).toBe('Widerruf bestätigen');
    expect(get('lt')?.withdrawLabel).toBe('atsisakyti sutarties čia');
    expect(get('lt')?.confirmLabel).toBe('patvirtinti sutarties atsisakymą');
    expect(get('fr')?.withdrawLabel).toBe('renoncer au contrat ici');
    expect(get('fr')?.confirmLabel).toBe('confirmer la rétractation');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(OFFICIAL_LABELS)).toBe(true);
    expect(Object.isFrozen(OFFICIAL_LABELS[0])).toBe(true);
  });

  it('data/labels.json matches the TypeScript data', () => {
    const json = JSON.parse(readFileSync(new URL('../data/labels.json', import.meta.url), 'utf8')) as {
      directive: string;
      labels: unknown;
    };
    expect(json.directive).toBe(DIRECTIVE_2023_2673_ELI);
    expect(json.labels).toEqual(JSON.parse(JSON.stringify(OFFICIAL_LABELS)));
  });
});

describe('interface strings', () => {
  const keys = Object.keys(MESSAGE_CATALOGUES.find((c) => c.language === 'en')?.messages ?? {}).sort();

  it('cover the same 24 languages, all marked as translation', () => {
    expect(MESSAGE_CATALOGUES.map((c) => c.language).sort()).toEqual(EU_LANGUAGES);
    for (const catalogue of MESSAGE_CATALOGUES) expect(catalogue.source).toBe('translation');
  });

  it.each(MESSAGE_CATALOGUES.map((c) => [c.language, c.messages] as const))('%s has every string', (_l, messages) => {
    expect(Object.keys(messages).sort()).toEqual(keys);
    for (const key of keys) {
      const value = messages[key as keyof Messages];
      expect(value.trim().length, key).toBeGreaterThan(0);
      expect(value).not.toMatch(/[<>]/u);
    }
    expect(messages.ackSent).toContain('{email}');
    expect(messages.ackPending).toContain('{email}');
    expect(messages.emailSubject).toContain('{receipt}');
  });
});
