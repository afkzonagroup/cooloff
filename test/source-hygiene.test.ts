import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('..', import.meta.url).pathname;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-typecheck', 'coverage', 'vendor', '.medusa', 'assets']);
const TEXT = /\.(ts|tsx|js|mjs|json|md|php|html|css|yml|yaml|xml|dist|txt|sh)$/u;
// Bidirectional controls, line/paragraph separators, zero-width characters and the BOM.
// Written with \u{...} escapes so no raw invisible character appears in this file.
const INVISIBLE = /[\u{202A}-\u{202E}\u{2066}-\u{2069}\u{2028}\u{2029}\u{200B}-\u{200F}\u{FEFF}]/u;

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...files(path));
    else if (TEXT.test(name) || name === 'LICENSE' || name === 'NOTICE') out.push(path);
  }
  return out;
}

describe('source hygiene', () => {
  const all = files(ROOT);

  it('scans the repository', () => {
    expect(all.length).toBeGreaterThan(50);
  });

  it('contains no raw bidirectional, separator or zero-width characters (Trojan Source)', () => {
    const offenders = all
      .filter((path) => INVISIBLE.test(readFileSync(path, 'utf8')))
      .map((path) => relative(ROOT, path));
    expect(offenders).toEqual([]);
  });

  it('the scanner itself detects such characters', () => {
    expect(INVISIBLE.test(`a${String.fromCodePoint(0x202e)}b`)).toBe(true);
    expect(INVISIBLE.test(`a${String.fromCodePoint(0x2028)}b`)).toBe(true);
    expect(INVISIBLE.test('plain text, äöü, ąčęėįšųūž, Ελληνικά')).toBe(false);
  });
});
