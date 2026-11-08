# Contributing

Thank you for helping. Please read this first.

## Before you start

- Every pull request needs a signed [Contributor Licence Agreement](CLA.md).
  Sign it in your first pull request as described there. We cannot merge
  without it.
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- Report security problems privately, never in a public issue. See
  [SECURITY.md](SECURITY.md).

## Ground rules

- **Law first.** Anything that implements a legal requirement must cite the
  article and paragraph and link the official text on EUR-Lex. Do not rely on
  blogs or summaries for what the law says.
- **Official wording is verbatim.** `src/core/labels.ts` holds text copied
  from the Official Journal. Do not edit it by hand. If you think a label is
  wrong, open an issue with the EUR-Lex link and the exact sentence. Run
  `npm run labels:verify` to compare every label with EUR-Lex.
- **Translations.** Interface strings in `src/core/messages.ts` are working
  translations. Native speakers are very welcome to improve them. Say which
  language you are a native speaker of in the pull request.
- **No new runtime dependencies** without discussion in an issue first.
- **No telemetry**, no network calls that the shop did not configure.

## Development

Requirements: Node.js 22 or newer, npm. For the WooCommerce plugin: Docker.

```sh
npm ci
npm run check          # typecheck + lint + tests with coverage
npm run example        # example shop on http://localhost:3000
connectors/woocommerce/bin/test.sh   # PHP tests in Docker
```

`npm run check` must pass. Rules the linter enforces:

- TypeScript `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- No `any`, no `@ts-ignore`. An `eslint-disable` needs a written reason on
  the same line.
- No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval` or `new Function`.

Every rule and every security control needs a test that fails if the rule or
control is removed.

## Pull requests

- Keep them small and focused. One topic per pull request.
- Add a line to `CHANGELOG.md` under "Unreleased".
- Describe what you changed and why, and how you tested it.
- Do not include personal data in tests, fixtures or screenshots.
