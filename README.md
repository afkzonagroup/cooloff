# Cooloff

The withdrawal function for online shops: a "withdraw from contract here"
button, a short withdrawal statement, a "confirm withdrawal" step and an
acknowledgement of receipt, as required by Article 11a of the Consumer Rights
Directive.

Cooloff is a framework-agnostic TypeScript library with a web component and
server handlers, plus plugins for WooCommerce and Medusa.

## Why it exists

[Directive (EU) 2023/2673](https://eur-lex.europa.eu/eli/dir/2023/2673/oj)
inserts Article 11a into the
[Consumer Rights Directive 2011/83/EU](https://eur-lex.europa.eu/eli/dir/2011/83/oj).
Member States had to adopt the rules by 19 December 2025 and **apply them
from 19 June 2026** (Article 2(1) of Directive (EU) 2023/2673).

Article 11a applies to every distance contract concluded through an online
interface (a website or an app) where the consumer has a right of withdrawal.
It is not limited to financial services: recital 37 says so explicitly. The
trader must offer a withdrawal function next to the existing ways to withdraw.

Cooloff implements that function so shops do not have to build it from the
legal text.

## Quick start

Requirements: Node.js 22 or newer.

```sh
npm install @afkzona/cooloff
```

Server (Node `http`):

```js
import { createServer } from 'node:http';
import { FileStore } from '@afkzona/cooloff/file-store';
import { createNodeHandler } from '@afkzona/cooloff/node';

const withdraw = createNodeHandler({
  secret: process.env.COOLOFF_SECRET, // at least 32 bytes, from the environment
  trader: { name: 'Example Shop', timeZone: 'Europe/Vilnius' },
  allowedOrigins: ['https://shop.example'],
  store: new FileStore({ directory: '/var/lib/shop/withdrawals' }),
  notifier: {
    // Send the acknowledgement with your own mail transport.
    send: (email) => mailer.send({ to: email.to, subject: email.subject, text: email.text, html: email.html }),
  },
});

createServer((req, res) => {
  if (req.url === '/api/withdrawal') void withdraw(req, res);
  else { res.statusCode = 404; res.end(); }
}).listen(3000);
```

Page:

```html
<script type="module" src="/assets/cooloff/component/define.js"></script>

<withdrawal-button endpoint="/api/withdrawal"></withdrawal-button>
```

Serve the files in `node_modules/@afkzona/cooloff/dist/core/` and
`dist/component/` under one folder (here `/assets/cooloff/`), or bundle
`@afkzona/cooloff/component/define` with your build tool.

To try it locally: clone the repository and run `npm ci && npm run example`,
then open <http://localhost:3000>.

## What the law requires and what Cooloff does

All references are to Directive 2011/83/EU as amended by Directive (EU)
2023/2673. Official text:
[EN](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L2673)
and every other language through the language switch on EUR-Lex.

| Requirement | Article | What Cooloff does |
|---|---|---|
| For distance contracts concluded through an online interface, the consumer can also withdraw by using a withdrawal function. | 11a(1), first subparagraph | `<withdrawal-button>` plus a server handler. |
| The function is labelled "withdraw from contract here" or an unambiguous corresponding formulation, in an easily legible way. | 11a(1), second subparagraph | The button shows the official wording in the page language (24 languages, verbatim from EUR-Lex). Large, high-contrast default style. You may set your own wording with `withdraw-label`. |
| Continuously available throughout the withdrawal period; prominently displayed; easily accessible. | 11a(1), second subparagraph; recital 37 | Cooloff never hides the button and never refuses a statement because of a date. **Placement is your job.** Recital 37 says consumers should not have to go through procedures to find or reach the function, for example downloading an app. A page that also works without logging in, linked from the footer and the order e-mails, is the safe choice; guests have no account to log in to. |
| The consumer sends an online withdrawal statement and can easily provide or confirm (a) their name, (b) details identifying the contract, (c) details of the electronic means for the confirmation. | 11a(2) | Three fields: name, order or contract number, e-mail address. All three can be pre-filled (`prefill-*`) so a logged-in consumer only confirms them (recital 37). |
| The consumer submits the statement through a confirmation function labelled only "confirm withdrawal" or an unambiguous corresponding formulation. | 11a(3) | The submit button carries the official wording and nothing else. You may set your own with `confirm-label`. |
| Acknowledgement of receipt on a durable medium, including its content and the date and time of its submission, without undue delay. | 11a(4) | The server records the time it received the statement and calls your notifier at once with an e-mail that contains the statement, every field, the date and time in the shop's time zone and in UTC, and a receipt number. If sending fails, `retryPendingAcknowledgements()` sends it later; run it on a schedule (WooCommerce and Medusa do this every 15 minutes). |
| The withdrawal is in time if the statement was submitted before the period expired. | 11a(5) | The submission time is stored with every record. |
| Partial withdrawal from a contract with several goods or services may be offered. | Recital 37 | Optional `items` field (`allow-partial`). |
| Unintended withdrawal must be avoided: the trader requires confirmation. | Recital 37 | Two steps: the button opens the form; only the confirmation sends it. |
| Pre-contractual information on the existence and placement of the withdrawal function. | 6(1)(h) | Not automated. Add it to your pre-contractual information and to the model withdrawal instructions (Annex I(A), instruction 3, as amended). |

The law is silent on how the trader stores withdrawals, on rate limits and on
the exact wording of the form. Everything Cooloff does there is an
implementation choice and is described as such below.

### Points where the text needs care

- The official English confirmation label is **"confirm withdrawal"**, without
  "here". Only the withdrawal function label ends with "here".
- English says the acknowledgement includes the date and time of the
  statement's **submission**. Some language versions say receipt (German:
  "Eingang"). Cooloff records the moment the server received the confirmed
  statement and labels it "date and time of submission". For a web form these
  are the same moment within network delay.
- Some language versions use a different structure for the label. Examples:
  Danish "Fortryd aftale" and German "Vertrag widerrufen" have no word for
  "here"; Greek and Slovenian say "click here to withdraw". Cooloff shows each
  language's own official wording.

## Official labels

Taken verbatim from Article 11a(1) and (3) of each language version of
Directive (EU) 2023/2673 on EUR-Lex. Every entry in
[`data/labels.json`](data/labels.json) has `source: "official"`, the EUR-Lex
URL it came from, and the full official sentence that quotes it. Run
`npm run labels:verify` to compare them with EUR-Lex again.

| Language | Withdrawal function | Confirmation function |
|---|---|---|
| bg | откажете се от договора тук | потвърждавам отказа |
| cs | zde odstoupit od smlouvy | potvrdit odstoupení od smlouvy |
| da | Fortryd aftale | Bekræft fortrydelse |
| de | Vertrag widerrufen | Widerruf bestätigen |
| el | Πατήστε εδώ για υπαναχώρηση | επιβεβαίωση υπαναχώρησης |
| en | withdraw from contract here | confirm withdrawal |
| es | desistir del contrato aquí | confirmar desistimiento |
| et | Taganen lepingust | Kinnitan taganemise |
| fi | Peruuta sopimus tästä | Vahvista peruuttaminen |
| fr | renoncer au contrat ici | confirmer la rétractation |
| ga | tarraing siar ón gconradh anseo | dearbhaigh an tarraingt siar |
| hr | odustati od ugovora | potvrditi odustajanje |
| hu | elállás a szerződéstől | elállás megerősítése |
| it | recedere dal contratto qui | conferma recesso |
| lt | atsisakyti sutarties čia | patvirtinti sutarties atsisakymą |
| lv | Atteikties no līguma | Apstiprināt atteikumu |
| mt | irtira mill-kuntratt hawnhekk | ikkonferma r-reċess |
| nl | hier de overeenkomst herroepen | herroeping bevestigen |
| pl | odstąp od umowy tutaj | potwierdź odstąpienie od umowy |
| pt | retrate-se do contrato aqui | confirmar retratação |
| ro | retrageți-vă din contract aici | confirmați retragerea |
| sk | odstúpiť od zmluvy tu | potvrdiť odstúpenie od zmluvy |
| sl | kliknite tukaj za odstop od pogodbe | potrdi odstop od pogodbe |
| sv | ångra avtalet här | bekräfta frånträde |

On a button the component upper-cases the first letter ("Withdraw from
contract here"); the words are unchanged. Set `label-case="verbatim"` to show
them exactly as written.

### Translations that need native review

Every other text (field labels, hints, error messages, the success message and
the acknowledgement e-mail) is a working translation, marked
`source: "translation"` in [`data/messages.json`](data/messages.json). They
need review by native speakers before production use in: Bulgarian, Croatian,
Czech, Danish, Dutch, Estonian, Finnish, French, German, Greek, Hungarian,
Irish, Italian, Latvian, Lithuanian, Maltese, Polish, Portuguese, Romanian,
Slovak, Slovenian, Spanish, Swedish. English is the source text. You can
override any string (`messages` property on the element, `messages` option on
the server).

## The web component

```html
<withdrawal-button
  endpoint="/api/withdrawal"
  lang="de"
  prefill-name="Jane Doe"
  prefill-contract="ORDER-1001"
  prefill-email="jane@example.eu"
  allow-partial></withdrawal-button>
```

| Attribute | Meaning |
|---|---|
| `endpoint` | URL of the server handler. Required. |
| `lang` | Language. Default: the nearest `lang` attribute on the page, then English. |
| `prefill-name`, `prefill-contract`, `prefill-email` | Values the consumer only has to confirm. |
| `allow-partial` | Show the optional items field. The server must allow it too. |
| `withdraw-label`, `confirm-label` | Your own unambiguous corresponding formulation. Leave them out to use the official wording. |
| `label-case` | `sentence` (default) or `verbatim`. |
| `heading-level` | 2 to 6 for the form heading. Default 2. |
| `header-name`, `header-value` | One extra request header, for example `X-WP-Nonce` or `x-publishable-api-key`. |

Events (bubbling, composed): `cooloff-open`, `cooloff-cancel`,
`cooloff-submitted` (`detail: { receiptId, submittedAt }`, no personal data).

Theming: CSS custom properties (`--cooloff-accent`, `--cooloff-accent-text`,
`--cooloff-text`, `--cooloff-muted`, `--cooloff-surface`, `--cooloff-border`,
`--cooloff-error`, `--cooloff-focus`, `--cooloff-radius`, `--cooloff-gap`,
`--cooloff-font`) and `::part()` (`button`, `panel`, `heading`, `intro`,
`form`, `field`, `label`, `input`, `hint`, `error`, `error-summary`,
`actions`, `confirm`, `cancel`, `status`, `success`, `receipt`, `close`).
Keep the label easily legible: Article 11a(1) and (3) require it.

Accessibility: visible labels, `aria-required`, errors linked with
`aria-describedby` and `aria-invalid`, an error summary with `role="alert"`,
focus moved to the form heading on open and back to the button on close,
Escape closes, `aria-expanded` on the button, a polite status region while
sending, 44 px targets, no horizontal scrolling at 320 px. Aimed at WCAG 2.1
AA; test it in your own page and theme.

Content Security Policy: the component works under
`script-src 'self'; style-src 'self'`. Styles are applied with constructable
stylesheets (`adoptedStyleSheets`); there are no `<style>` elements, no
`style` attributes and no inline event handlers. It needs `connect-src` to
allow the endpoint. Browser support: any browser with constructable
stylesheets (Chrome 73+, Edge 79+, Firefox 101+, Safari 16.4+). Without them
the component works but is unstyled.

Provide a fallback for visitors without JavaScript, for example a
`<noscript>` with your e-mail address.

## Server

All server parts share one Fetch API handler:

```ts
createWithdrawalHandler(options): (request: Request, context?: { clientAddress?: string }) => Promise<Response>
```

It accepts only `POST` with `Content-Type: application/json`, and answers:

| Status | Body | When |
|---|---|---|
| 201 | receipt | New statement recorded. |
| 200 | receipt | Same statement with the same idempotency key again. Same receipt, no new record. |
| 400 | `{ "error": "validation_failed", "errors": [{ "field", "code" }] }` | Invalid fields. Also `invalid_json`, `invalid_encoding`. |
| 403 | `{ "error": "forbidden_origin" }` | Origin check failed. |
| 405 | `{ "error": "method_not_allowed" }` | Not `POST`. |
| 409 | `{ "error": "idempotency_conflict" }` | Same idempotency key with different content. The component then retries once with a new key. |
| 413 | `{ "error": "payload_too_large" }` | Body over the limit. |
| 415 | `{ "error": "unsupported_media_type" }` | Not JSON. |
| 429 | `{ "error": "rate_limited" }` and `Retry-After` | Rate limit hit. |
| 500 | `{ "error": "internal_error" }` | Anything else. Never a stack trace or message. |

Receipt body:

```json
{
  "receiptId": "WD-7K3Q-M2XA-9C1D-T0VB",
  "submittedAt": { "utc": "2026-06-19T08:30:00.000Z", "local": "2026-06-19T11:30:00+03:00", "timeZone": "Europe/Vilnius" },
  "acknowledgement": "sent",
  "statement": { "name": "Jane Doe", "contract": "ORDER-1001", "email": "jane@example.eu", "items": [], "language": "en" }
}
```

`acknowledgement` is `pending` when the notifier failed or the recipient limit
held the e-mail back. The record is kept, and the same submission sent again
triggers a new attempt. Two identical submissions that arrive at the same
moment can both trigger an e-mail; a duplicate acknowledgement is harmless.

### Pending acknowledgements

Article 11a(4) requires the acknowledgement without undue delay, also when
your mail transport was down. Call `retryPendingAcknowledgements()` on a
schedule, for example every 15 minutes. It is a method of the handler (and of
the Node handler, the Express middleware and the Next.js route handlers). It
sends what is still pending for records up to 72 hours old (`maxAgeHours`,
at most 720), at most 100 per call (`limit`), and returns
`{ sent, pending }`. The recipient limit still applies. It needs a store with
`listUnacknowledged` (`MemoryStore` and `FileStore` have it).

```js
setInterval(() => { void withdraw.retryPendingAcknowledgements(); }, 15 * 60 * 1000);
```

On serverless platforms, call it from a scheduled job (for example a cron
route). Records older than the window stay pending: look for records without
an acknowledgement time and contact those consumers yourself.

### Options

| Option | Default | Meaning |
|---|---|---|
| `secret` | required | At least 32 bytes. Keys the receipt IDs and idempotency keys (HMAC-SHA-256). Read it from the environment. |
| `trader` | required | `{ name, timeZone }`. `timeZone` is an IANA name such as `Europe/Vilnius`. |
| `allowedOrigins` | required | Origins allowed to submit, such as `https://shop.example`. |
| `store` | required | Where withdrawals are kept: `MemoryStore`, `FileStore` or your own `WithdrawalStore`. |
| `notifier` | required | `{ send(email, acknowledgement) }`. Sends the acknowledgement on a durable medium. |
| `rateLimiter` | 10 per minute per client address | A `RateLimiter`, or `false` if you limit elsewhere. IPv6 addresses are counted per /64 network (`clientRateLimitKey`). |
| `recipientRateLimiter` | 5 e-mails per hour per recipient address | Holds back acknowledgement e-mails beyond the limit so the endpoint cannot flood an inbox. `jane+1@` and `jane@` count as one address. The withdrawal is still stored and the response says `pending`; the scheduled retry sends it later. `false` switches it off. |
| `maxBodyBytes` | 16384 | 1024 to 1048576. |
| `allowPartial` | `false` | Accept a list of items. |
| `defaultLanguage` | `en` | Used when a request names no language. |
| `messages` | none | Overrides per language, such as `{ de: { traderLabel: 'Händler' } }`. |
| `allowMissingOrigin` | `false` | Accept requests without `Origin` and without `Sec-Fetch-Site`. Only for trusted non-browser clients. |
| `onWithdrawal` | none | Called once per new withdrawal after it is stored. |
| `onError` | one line to `console.error` with the error name | Called with the phase (`store`, `notify`, `hook`, `internal`) and the error. Never receives the request body. |

<!-- doctest -->
```ts
import { createWithdrawalHandler, MemoryStore } from '@afkzona/cooloff/server';

const sent: string[] = [];
const handler = createWithdrawalHandler({
  secret: 'replace-with-at-least-32-bytes-from-env',
  trader: { name: 'Example Shop', timeZone: 'Europe/Vilnius' },
  allowedOrigins: ['https://shop.example'],
  store: new MemoryStore(),
  notifier: { send: async (email) => { sent.push(email.subject); } },
});

const response = await handler(
  new Request('https://shop.example/api/withdrawal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://shop.example' },
    body: JSON.stringify({
      name: 'Jane Doe',
      contract: 'ORDER-1001',
      email: 'jane@example.eu',
      idempotencyKey: 'k_0123456789abcdef',
    }),
  }),
  { clientAddress: '203.0.113.7' },
);

if (response.status !== 201) throw new Error(`unexpected ${String(response.status)}`);
if (!sent[0]?.startsWith('Acknowledgement of receipt of your withdrawal WD-')) throw new Error('no acknowledgement');
```

### Node `http`

`createNodeHandler(options)` from `@afkzona/cooloff/node`. Same options plus
`clientAddress(req)` (default: the socket address). Behind a reverse proxy,
return the address your proxy reports, and only if you trust it.

### Express

```js
import express from 'express';
import { createExpressMiddleware } from '@afkzona/cooloff/express';

const app = express();
app.post('/api/withdrawal', createExpressMiddleware(options)); // before express.json()
app.use(express.json());
```

The middleware reads the raw body itself, so mount it before any body parser.
It uses `req.ip`, which follows Express's `trust proxy` setting.

### Next.js (App Router)

```ts
// app/api/withdrawal/route.ts
import { createNextRouteHandlers, forwardedForAddress } from '@afkzona/cooloff/next';
import { store, notifier } from '@/lib/withdrawals';

export const runtime = 'nodejs';
export const { POST } = createNextRouteHandlers({
  secret: process.env.COOLOFF_SECRET!,
  trader: { name: 'Example Shop', timeZone: 'Europe/Vilnius' },
  allowedOrigins: ['https://shop.example'],
  store,
  notifier,
  clientAddress: (request) => forwardedForAddress(request),
});
```

Route handlers get no socket address, so `clientAddress` is required: with one
shared rate-limit bucket a single client could block the withdrawal function
for everyone. Use `forwardedForAddress` only when your platform sets
`X-Forwarded-For` (Vercel and most load balancers do). If you limit elsewhere,
pass `rateLimiter: false` instead. The in-memory rate limiter and
`MemoryStore` do not work across serverless instances: use a shared store and
limiter. `createNextRouteHandlers` also returns `retryPendingAcknowledgements`
for your scheduled job.

### Other runtimes

Deno, Bun and Cloudflare Workers speak the Fetch API: call the handler from
`createWithdrawalHandler` directly with the client address from the platform.
`FileStore` needs Node's file system.

### Stores

- `MemoryStore`: for tests and demos. Lost on restart.
- `FileStore` (`@afkzona/cooloff/file-store`): append-only JSON Lines file.
  One line per withdrawal and one per acknowledgement; nothing is rewritten.
  The file is created with mode 0600 (an existing file is tightened to
  0600) and a missing folder with 0700; a folder writable by group or others,
  or owned by another user than the process user or root, is refused; symbolic
  links are refused; the file name
  allows only letters, digits, `.`, `_` and `-`. Writes are serialised and
  `fsync`ed. One process only. The whole log is read into memory on first use.
- Your own: implement `get`, `insert` (atomic per storage key),
  `markAcknowledged` and, for the retry, `listUnacknowledged(since, limit)`.

Storage is not required by Article 11a. Keeping a record is an implementation
choice that helps you show when a statement was submitted (Article 11a(5)).
Decide how long you keep it under your data protection rules.

### Notifier

Cooloff ships no mail client. `renderAcknowledgementEmail(ack)` returns
`{ to, subject, text, html }`; every dynamic value in the HTML is escaped and
the subject never contains line breaks. Hand it to your transport (SMTP,
an e-mail API, your shop's mailer). E-mail is a durable medium in the sense of
Article 2(10); the amended model instructions (Annex I(A)) name e-mail as an
example.

### Core functions

From `@afkzona/cooloff/core` (no dependencies, runs in browsers and servers):
`validateWithdrawalRequest`, `normaliseText`, `isValidEmail`,
`computeReceiptId`, `buildAcknowledgement`, `renderAcknowledgementEmail`,
`formatZoned`, `getOfficialLabels`, `getMessages`, `resolveLanguage`.

<!-- doctest -->
```ts
import { buildAcknowledgement, getOfficialLabels, validateWithdrawalRequest } from '@afkzona/cooloff/core';

const labels = getOfficialLabels('de-AT');
if (labels.withdrawLabel !== 'Vertrag widerrufen' || labels.confirmLabel !== 'Widerruf bestätigen') throw new Error('labels');

const result = validateWithdrawalRequest({
  name: '  Jane   Doe ',
  contract: 'ORDER-1001',
  email: 'jane@example.eu',
  idempotencyKey: 'k_0123456789abcdef',
});
if (!result.ok) throw new Error('invalid');
const { idempotencyKey: _key, ...statement } = result.value;

const ack = buildAcknowledgement({
  statement,
  receiptId: 'WD-0000-0000-0000-0000',
  submittedAt: new Date('2026-06-19T08:30:00Z'),
  trader: { name: 'Example Shop', timeZone: 'Europe/Vilnius' },
});
if (ack.submittedAt.local !== '2026-06-19T11:30:00+03:00') throw new Error('time');
if (statement.name !== 'Jane Doe') throw new Error('normalise');
```

### Validation rules

| Field | Rule |
|---|---|
| `name` | Required string. Normalised (Unicode NFC; control, bidirectional and zero-width characters removed; spaces collapsed). 1 to 200 characters. |
| `contract` | Required string, same normalisation, 1 to 100 characters. |
| `email` | Required. `local@domain.tld`, at most 254 characters, local part at most 64. International letters allowed. No quoted local parts, IP literals, single-label domains or line breaks. Domain lower-cased. |
| `items` | Optional array of at most 50 strings of at most 200 characters, only when partial withdrawal is allowed. Empty entries are dropped. Empty list = whole contract. |
| `language` | Optional. One of the 24 codes. |
| `idempotencyKey` | Required. 16 to 64 characters of `A-Z a-z 0-9 _ -`. The component creates one per form session. |
| other fields | Refused. |

The limits are implementation choices; the law sets none.

## WooCommerce

Folder [`connectors/woocommerce/cooloff`](connectors/woocommerce/cooloff).
Requires WordPress 6.5+, WooCommerce and PHP 8.1+.

Install: run `npm ci && npm run build && connectors/woocommerce/bin/build.sh --zip`
and upload `connectors/woocommerce/cooloff.zip` under Plugins > Add New.

- The button appears on each order page in My account, pre-filled with the
  order number, name and e-mail. For guests, add a page with the shortcode
  `[cooloff_withdrawal]` and link it prominently (footer, order e-mails).
- REST endpoint `POST /wp-json/cooloff/v1/withdrawals`, open to guests, with
  the same origin check, JSON-only, 16 KiB limit, rate limit (transients),
  validation and idempotency as the TypeScript handler. Logged-in consumers
  also send a `wp_rest` nonce, which WordPress core checks.
- Withdrawals are stored in `{prefix}cooloff_withdrawals` with prepared
  statements and listed under WooCommerce > Withdrawals (capability
  `manage_woocommerce`, every value escaped). A private order note is added
  when the order number and billing e-mail match. With a custom order number
  plugin, return the order from the `cooloff_find_order` filter.
- The acknowledgement is sent with `wp_mail` as HTML with a plain-text part,
  at most 5 per recipient address and hour. Pending acknowledgements are
  retried by WP-Cron every 15 minutes (hook
  `cooloff_retry_acknowledgements`). WP-Cron runs on page visits; on quiet
  sites trigger it from a real cron job.
- Secret: `COOLOFF_SECRET` constant in `wp-config.php`, or the
  `COOLOFF_SECRET` environment variable, or a random secret created on
  activation.
- Records are kept on uninstall unless "Delete all withdrawal records" is
  ticked.
- Filters: `cooloff_allowed_origins`, `cooloff_client_address`,
  `cooloff_rate_limit`, `cooloff_find_order`. Action:
  `cooloff_withdrawal_received`. IPv6 clients are rate-limited per /64.

Tests: `connectors/woocommerce/bin/test.sh` (PHPUnit and WordPress Coding
Standards in Docker) and `connectors/woocommerce/tests/integration/run.sh`
(a real WordPress and WooCommerce in Docker). The PHP code reproduces the
TypeScript receipt IDs and acknowledgements from the shared
[`data/test-vectors.json`](data/test-vectors.json).

## Medusa

Package `@afkzona/cooloff-medusa` in [`connectors/medusa`](connectors/medusa),
for Medusa 2.22 or newer.

```ts
// medusa-config.ts
module.exports = defineConfig({
  // ...
  plugins: [
    {
      resolve: '@afkzona/cooloff-medusa',
      options: { traderName: 'Example Shop', timeZone: 'Europe/Vilnius' },
    },
  ],
});
```

Set `COOLOFF_SECRET` in the environment, then run `npx medusa db:migrate`.

- Store route `POST /store/cooloff/withdrawals`. It is a normal store route:
  Medusa's store CORS and publishable API key apply. On the storefront:
  `<withdrawal-button endpoint="https://api.shop.example/store/cooloff/withdrawals" header-name="x-publishable-api-key" header-value="pk_...">`.
- Allowed origins default to the plain entries of `storeCors`.
- Withdrawals are stored in PostgreSQL through a module of their own
  (`cooloff_withdrawal`) and linked to the order when the display ID and
  e-mail match.
- The acknowledgement goes through Medusa's Notification Module on the
  `email` channel with template `cooloff-withdrawal-acknowledgement` and
  content `{ subject, text, html }`. Configure an e-mail provider.
- Event `cooloff.withdrawal.received` with `{ id, receipt_id, order_id }`.
- Admin: a Withdrawals page and an order widget, and
  `GET /admin/cooloff/withdrawals` (admin authentication).
- A scheduled job (`cooloff-retry-acknowledgements`, every 15 minutes) sends
  pending acknowledgements. Scheduled jobs run in Medusa's worker; the rate
  limiters are kept in memory per process.

Options: `traderName`, `timeZone` (required), `allowedOrigins`,
`allowPartial`, `notificationTemplate`, `rateLimitPerMinute`. Medusa refuses
to start when the options, `allowedOrigins` or `COOLOFF_SECRET` are unusable.
If `allowedOrigins` is not set and `storeCors` holds only patterns, every
submission fails: set `allowedOrigins`.

Rate limiting uses `req.ip`. Medusa sets Express `trust proxy` to 1, so
`req.ip` is the address reported by the nearest proxy. Run Medusa behind a
reverse proxy that sets `X-Forwarded-For`; otherwise clients can pick their
own rate-limit key.

Tests: `npm run check` in `connectors/medusa` (type checks and unit tests) and
`connectors/medusa/integration-tests/run.sh`, which builds the plugin and runs
it in a real Medusa application with PostgreSQL in Docker.

## Roadmap

- **Shopware 6 plugin.** Not started. A plugin that is finished properly needs
  its own storefront integration, administration module, migrations and tests
  against a running Shopware; that work is planned, not done.
- **Magento 2 module.** Not started, for the same reason.
- Native-speaker review of the interface translations.
- A shared rate limiter and store example for serverless platforms.

Until then, Shopware and Magento shops can use the web component with the
Node handler or a small endpoint of their own that follows the same rules and
the shared test vectors.

## Limitations

- Cooloff does not make a shop compliant. It implements the withdrawal
  function. The rest of the Consumer Rights Directive and national law
  (information duties, the withdrawal period, refunds, exceptions to the right
  of withdrawal) stays with you.
- Cooloff does not decide whether a right of withdrawal exists or whether a
  withdrawal is late. It records when the statement arrived.
- A statement does not prove who sent it. The function works without login,
  so anyone who knows an order number can send one. Check it before you
  refund or cancel, as with a withdrawal by e-mail.
- National transposition laws may add details. Check the law of the Member
  States you sell to.
- The electronic means for the acknowledgement is e-mail. Article 11a(2)(c)
  does not limit it to e-mail; other channels need your own notifier and
  form.
- Placement and prominence of the button on your pages are your
  responsibility.
- The in-memory rate limiter and the file store are for a single process.
- The EEA EFTA countries (Iceland, Liechtenstein, Norway) are not covered by
  the 24 EU language versions used here.

## Security

See [SECURITY.md](SECURITY.md) for the threat model and how to report a
vulnerability. In short: origin check against CSRF, strict JSON content type,
body size limit, rate limiting, allow-list validation, HMAC receipt IDs,
constant-time comparison, no stack traces to clients, no `innerHTML`, strict
CSP support, append-only storage with restrictive permissions, no telemetry.

Personal data (name, contract, e-mail) stays on your servers. Cooloff sends
nothing anywhere you did not configure.

## Dependencies

Runtime: **none**. The package uses only the platform (Web Crypto,
`Intl`, Fetch API, Node's `fs`, `http`, `path` for the Node parts).

Development only, pinned in `package.json`:

- `typescript`, `eslint`, `@eslint/js`, `typescript-eslint`: type checking and
  linting.
- `vitest`, `@vitest/coverage-v8`: tests and coverage.
- `happy-dom`: a DOM for the component tests. Chosen over jsdom because it
  implements constructable stylesheets and `adoptedStyleSheets`, which the
  component relies on, and Shadow DOM focus handling; jsdom does not support
  `adoptedStyleSheets`.
- `express`, `@types/express`: to test the Express adapter against real
  Express.
- `@types/node`.

The WooCommerce plugin has no runtime dependencies; PHPUnit and the WordPress
Coding Standards are development tools installed with Composer in Docker. The
Medusa plugin depends on `@afkzona/cooloff` and on Medusa itself as a peer.

## Licence and Enterprise

Apache License 2.0. Copyright 2026 MB AFKzona Group. See [LICENSE](LICENSE)
and [NOTICE](NOTICE). "Cooloff" is a trademark of MB AFKzona Group; see
[TRADEMARKS.md](TRADEMARKS.md).

### Enterprise

MB AFKzona Group offers integration into your systems, custom connectors and
features, and support agreements. Contact info@afkzonagroup.lt.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Pull requests need a signed
[CLA](CLA.md). Native speakers who can review the translations are especially
welcome.

## Disclaimer

This is not legal advice. Cooloff helps you build the withdrawal function of
Article 11a of Directive 2011/83/EU; it does not guarantee compliance with any
law. Check the official text and your national law, and ask a lawyer when in
doubt.

Maintained by AFKzona Group.
