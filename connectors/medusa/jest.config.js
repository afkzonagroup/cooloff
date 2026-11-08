// Unit tests for the plugin's own logic. The end-to-end test is integration-tests/run.sh.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/integration-tests/unit/**/*.test.ts'],
  transform: {
    '^.+\\.(t|j)sx?$': ['@swc/jest', { jsc: { parser: { syntax: 'typescript' }, target: 'es2022' }, module: { type: 'commonjs' } }],
  },
  // @afkzona/cooloff is ESM; let SWC turn it into CommonJS for Jest.
  transformIgnorePatterns: ['/node_modules/(?!@afkzona/cooloff)'],
};
