import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * Doctest: every ```ts block in README.md preceded by `<!-- doctest -->` is
 * written to a temporary module and executed. A block fails the test by
 * throwing.
 */
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const blocks = [...readme.matchAll(/<!-- doctest -->\s*```ts\n([\s\S]*?)```/gu)].map((match) => match[1] ?? '');
const dir = new URL('./.doctest/', import.meta.url);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('README examples', () => {
  it('has examples marked for testing', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(2);
  });

  it.each(blocks.map((code, index) => [index, code] as const))('example %i runs', async (index, code) => {
    mkdirSync(dir, { recursive: true });
    const file = new URL(`example-${String(index)}.ts`, dir);
    writeFileSync(file, `${code}\nexport {};\n`);
    await expect(import(/* @vite-ignore */ file.href)).resolves.toBeDefined();
  });
});
