import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const src = (path: string): string => fileURLToPath(new URL(`./src/${path}`, import.meta.url));

export default defineConfig({
  resolve: {
    // README examples import the published entry points; map them to the sources.
    alias: [
      { find: /^@afkzona\/cooloff\/core$/u, replacement: src('core/index.ts') },
      { find: /^@afkzona\/cooloff\/server$/u, replacement: src('server/index.ts') },
      { find: /^@afkzona\/cooloff\/node$/u, replacement: src('server/node.ts') },
      { find: /^@afkzona\/cooloff\/express$/u, replacement: src('server/express.ts') },
      { find: /^@afkzona\/cooloff\/next$/u, replacement: src('server/next.ts') },
      { find: /^@afkzona\/cooloff\/file-store$/u, replacement: src('server/file-store.ts') },
      { find: /^@afkzona\/cooloff$/u, replacement: src('index.ts') },
    ],
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
