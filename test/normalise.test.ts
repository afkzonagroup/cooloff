import { describe, expect, it } from 'vitest';

import { hasUnsafeCharacters, normaliseEmail, normaliseText } from '../src/core/normalise.js';

const RLO = String.fromCodePoint(0x202e);
const ZWSP = String.fromCodePoint(0x200b);
const BOM = String.fromCodePoint(0xfeff);

describe('normaliseText', () => {
  it('trims and collapses white space', () => {
    expect(normaliseText('  Jane \t\n Doe  ')).toBe('Jane Doe');
  });

  it('removes control, bidi and zero-width characters', () => {
    expect(normaliseText(`Jane${RLO}Doe`)).toBe('Jane Doe');
    expect(normaliseText(`A${ZWSP}B${BOM}`)).toBe('A B');
    expect(normaliseText('A\u{0}B\u{7}C')).toBe('A B C');
    expect(normaliseText('line\r\nbreak')).toBe('line break');
  });

  it('applies NFC', () => {
    expect(normaliseText('e\u{301}')).toBe('\u{e9}');
  });
});

describe('hasUnsafeCharacters', () => {
  it('detects unsafe characters and has no state between calls', () => {
    expect(hasUnsafeCharacters(`a${RLO}`)).toBe(true);
    expect(hasUnsafeCharacters(`a${RLO}`)).toBe(true);
    expect(hasUnsafeCharacters('plain')).toBe(false);
  });
});

describe('normaliseEmail', () => {
  it('lower-cases the domain only', () => {
    expect(normaliseEmail('  Jane.Doe@Example.EU ')).toBe('Jane.Doe@example.eu');
  });

  it('keeps values without @', () => {
    expect(normaliseEmail(' abc ')).toBe('abc');
  });
});
