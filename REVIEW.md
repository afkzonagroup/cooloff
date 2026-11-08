# Review record

Two review passes were made before the independent review, as GOAL.md
requires. Each lists what was checked, what was found and what was fixed.

## Pass 1: correctness, law, API, tests

### Checked

- **Law, against the official text on EUR-Lex.** Article 11a as inserted by
  Article 1(3) of Directive (EU) 2023/2673, Article 6(1)(h) as amended,
  recitals 36 and 37, Article 2 (dates) and Annex I (model instructions). The
  English text was read in full; the label sentences of all 24 language
  versions were extracted from the official HTML with two independent
  extractors (a Python text extraction and `scripts/verify-labels-eurlex.mjs`)
  and both agree. No corrigendum to Directive (EU) 2023/2673 exists on
  EUR-Lex at the time of writing.
- **Every requirement in the README mapping table** traced to code and to a
  test: two steps, label wording, three fields with prefill, the confirmation
  label "only" with the prescribed words, acknowledgement content (statement,
  every field, date and time in UTC and shop time zone), record of the
  submission time.
- **Validation rules**: every field, boundary (exact maximum, one over, far
  over), type, unknown fields, `__proto__`, null-prototype objects.
- **Time handling**: DST changes, negative and half-hour offsets, date-line
  crossings, sub-second instants.
- **Receipt IDs**: determinism, sensitivity to every field and the secret,
  unambiguous canonical form, Crockford base32 vectors. PHP reproduces the
  TypeScript values from shared test vectors.
- **API design**: entry points, option names, error codes, response shape,
  TSDoc on every export, README examples executed by `test/readme.test.ts`.
- **Component**: rendering in all 24 languages, focus order, ARIA wiring,
  error flow, retry flow, events; screenshots at 1280 px and 320 px in
  English, German and Lithuanian, and inside a real WooCommerce order page.
- **Connectors**: WooCommerce unit tests, WordPress Coding Standards, a real
  WordPress 7.1 and WooCommerce 11.2 install; Medusa 2.22 unit tests and a
  real Medusa application with PostgreSQL.

### Found and fixed

| # | Finding | Fix |
|---|---|---|
| 1 | The task brief said "confirm withdrawal here" and "date and time of receipt". The official English text says **"confirm withdrawal"** and **"date and time of its submission"**; German says "Eingang" (receipt). | Followed the official text. Documented both points in the README. |
| 2 | The status line under the form left an empty gap; the programmatic focus ring on the form heading looked like a stray box. | Status moved into the action row; outline removed for elements that only receive programmatic focus (`tabindex="-1"`). |
| 3 | The Node adapter destroyed the request stream when a body was too large, so the client got 500 instead of 413, and the socket address was read after the stream was gone. | Address read first; body read with events and paused at the limit; the connection is closed after the 413 is written. Test with a chunked oversize body. |
| 4 | Store failures were reported as phase `internal`. | Reported as `store`; the client still gets a plain 500. |
| 5 | The `messages` property only applied before the element was connected. | Getter and setter that re-render while the form is closed. |
| 6 | `csrf-header` was a misleading name once Medusa needed a publishable key header. | Renamed to `header-name` and `header-value`. |
| 7 | PHP length checks used `mb_convert_encoding`, which not every WordPress host has. | Length computed with PCRE to match JavaScript UTF-16 lengths; `mb_strtolower` only when available. |
| 8 | Medusa started with an unusable configuration and failed on the first request. | Module loader validates options and `COOLOFF_SECRET` at boot. Unit tests. |
| 9 | Medusa test app failed type checking under `exactOptionalPropertyTypes`. | Fixed. |
| 10 | Several tests were weaker than they looked (a lazy stream that was read eagerly; a nonce test that passed with an empty nonce; a table-count check that counted the header line). | Rewritten so each fails without the behaviour it tests. |
| 11 | README examples were not tested. | `<!-- doctest -->` blocks are executed; a broken example fails `npm run check` (checked by breaking one). |
| 12 | The Medusa admin page could not load in the test app because the plugin was referenced by path; the admin bundler imports plugins by package name. | The test installs the plugin into the app by name (a link), as a shop would. Admin page and order widget checked in screenshots at 1440 px and 390 px. |
| 13 | On a phone the Medusa admin table squeezed receipt numbers and dates over four lines. | Table scrolls horizontally; receipt and date cells do not wrap. |

## Pass 2: security and hostile use

Approach: read every input path as an attacker, then remove each security
control in turn and confirm a test fails (mutation check).

### Checked

- Every request path in the Fetch handler, the Node, Express and Next
  adapters, the WordPress REST route and the Medusa store route: method,
  origin, content type, size (declared, streamed, chunked), encoding, JSON
  depth, schema, idempotency, rate limiting, error output.
- The component: every place a string reaches the DOM, the endpoint
  attribute, the extra header, server responses used for rendering.
- The acknowledgement e-mail: HTML escaping of every value, header injection.
- The file store: path handling, symlinks before and after loading,
  permissions, torn writes, malformed lines.
- WordPress: nonces, capability checks, prepared statements, escaping in the
  admin list, shortcode and order notes, CORS behaviour of the REST API.
- Medusa: publishable key, store CORS preflight, admin authentication,
  admin filter input.
- Supply chain: runtime dependencies (none), `npm audit --omit=dev` (clean),
  lockfiles, pinned action SHAs, CI permissions and triggers.
- Repository hygiene: a test fails on raw bidirectional, separator and
  zero-width characters in any text file.

### Mutation check (control removed, does a test fail?)

Origin check, content-type check, body limit, rate limit, recipient limit,
idempotency conflict, HTML escaping, unknown-field refusal, file name
allow-list, `O_NOFOLLOW`, directory permission check, endpoint scheme check,
reserved headers, unsafe-character removal, generic 500 body: **all fail at
least one test.** `O_NOFOLLOW` first survived (the load-time `lstat` also
catches a symlink); a test that swaps the log for a symlink after loading
was added and now fails without it.

### Found and fixed

| # | Finding | Fix |
|---|---|---|
| 1 | **Inbox flooding**: anyone could send statements with someone else's e-mail address from many IP addresses, and each one sent an e-mail. | Per-recipient limit on acknowledgement e-mails (default 5 per hour, keyed by an HMAC of the address) in the handler and the WooCommerce plugin. Statements are always stored; the response says `pending`. Tests in TypeScript and in the WordPress end-to-end run. |
| 2 | **FileStore changed the permissions of an existing directory** to 0700. Given a shared directory such as `/tmp`, a process running as root would have locked it. | Existing directories are never changed. A directory writable by group or others is refused. New directories get 0700. |
| 3 | The `header-name` attribute could override `Content-Type`, `Origin` or `Cookie`. | Reserved names are ignored. Test. |
| 4 | WooCommerce order notes are rendered with `wp_kses_post`, so consumer-supplied item names could add links to an admin's order view. | Note parts escaped with `esc_html`. |
| 5 | WordPress answers REST requests from any origin with permissive CORS headers. | Confirmed the origin check refuses foreign origins before anything is stored (end-to-end test). Documented in SECURITY.md. |
| 6 | Deeply nested JSON could raise a stack error. | Confirmed it ends as 400, not 500. Test. |
| 7 | Medusa sets `trust proxy` to 1, so without a reverse proxy clients can choose their own rate-limit key with `X-Forwarded-For`. | Documented in the README with the deployment requirement. |
| 8 | An end-to-end run left Medusa child processes running after the parent was stopped, so a later run tested the old server. | The test refuses to start on a busy port and, when it ends, stops the Medusa processes it started and whatever listens on its port. |

### Accepted, documented

- Development-only advisory in `minimatch` through ESLint tooling; not
  shipped; `npm audit --omit=dev` is clean.
- Statements can be sent for any contract number without login. The law
  requires a function that works for guests; orders are only linked when the
  order number and e-mail match.
- The in-memory rate limiters and the file store are for one process.

## Results at the end of both passes

- `npm run check`: type check, lint and 359 tests pass; coverage 99 % of lines
  and 94 % of branches in `src/`.
- WooCommerce: 49 PHPUnit tests, PHPCS clean, 46 end-to-end checks pass.
- Medusa: type checks, 7 unit tests, 33 end-to-end checks pass.
- All 24 language versions re-checked against EUR-Lex.

## Independent review

A separate review after both passes, done against the code and the official
text rather than against this record or the README.

### Checked

- **Law.** Directive (EU) 2023/2673 and the consolidated Directive 2011/83/EU
  (version of 27 September 2026) fetched from EUR-Lex. Article 11a read word
  by word against the code: label of the withdrawal function, continuous
  availability, the three items the consumer provides or confirms, the
  confirmation function labelled only with the prescribed words, the
  acknowledgement on a durable medium with its content and the date and time
  of submission without undue delay, and paragraph 5. Also Article 6(1)(h),
  Article 2(10), recitals 36 and 37, Article 2 of the amending directive
  (19 December 2025 / 19 June 2026) and the amended Annex I(A) instruction 3.
  Paragraph 4 checked in German ("Eingang"), French and Lithuanian.
- **Official labels**, both labels, in 16 languages against the EUR-Lex text
  of Article 11a (not the recitals, where some phrases also occur): da, de,
  el, en, es, et, fi, fr, hr, hu, it, lt, lv, nl, pl, sl. All match
  `data/labels.json` exactly.
- **README and SECURITY.md** claims against the law and the code.
- **CSRF as an attacker**: `null` origin, missing origin, `Referer` only,
  look-alike and sub-domains, other ports, `:443`, `http` against `https`,
  trailing slash, upper case, `Sec-Fetch-Site` `none` and `same-site`,
  `text/plain` and comma-joined content types, CORS on WordPress and Medusa.
- **Abuse**: rate limiting (IPv4, IPv6, IPv4-mapped, missing address),
  e-mail flooding (per recipient, sub-address tags), idempotency key reuse,
  receipt ID forgery, CRLF in name, e-mail and subject, HTML in every field,
  deep and oversized JSON, `__proto__`.
- **File store**: paths, symlinks, permissions, directory ownership.
- **Component** in Chromium (Playwright's bundled browser) on the example page
  under `script-src 'self'; style-src 'self'` at 1280 and 320 px: full
  submission, no CSP reports, no horizontal scrolling, and hostile values in
  every attribute and in `messages` (no element or script injected, no
  dialog). The example (`npm run example`) and the WooCommerce zip build from
  the README were run as written.
- **WooCommerce**: REST permission callback, nonce handling, origin check,
  capability checks, prepared statements, escaping, order matching and
  ownership, uninstall.
- **Medusa**: request scoping, admin authentication, input validation, origin
  configuration, publishing of the package.
- **Mutation check**: 22 controls in the TypeScript code and 3 in the
  connectors removed one at a time.
- **Publish gate**: authors, committers and messages of every commit, and
  every tracked file.

### Found and fixed

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | High | **Medusa: no rate limit and no recipient limit at all.** The handler was cached per `req.scope`, but Medusa creates a new scope for every request, so every request got fresh in-memory limiters. Anyone could submit without limit and flood any inbox with acknowledgements. | Handler cached per module service (one per application). Unit tests with a new scope per call; end-to-end test: the 13th request from one client gets 429 and only 5 e-mails go to one address. Both fail with the old cache. |
| 2 | High | **Pending acknowledgements were never sent unless the consumer submitted again**, while the success message said "We will send the acknowledgement". Article 11a(4) requires it without undue delay. | `retryPendingAcknowledgements()` on the handler and every adapter (records up to 72 hours old, recipient limit still applies), `listUnacknowledged` on the stores, WP-Cron every 15 minutes in WooCommerce, a scheduled job every 15 minutes in Medusa, a timer in the example. Tests in all three, including the real WordPress run. |
| 3 | Medium | IPv6 clients were limited per single address; one client with a /64 has 2^64 rate-limit keys. | `clientRateLimitKey`: IPv6 per /64, IPv4-mapped as IPv4, zone IDs and brackets removed. Same in PHP. Unit tests, WordPress run with addresses from one /64. |
| 4 | Medium | Next.js adapter without `clientAddress` put every client in one bucket, so one client could block the withdrawal function for everyone. | The adapter refuses to start without `clientAddress`, unless `rateLimiter: false`. |
| 5 | Low | The recipient limit could be multiplied with sub-address tags (`jane+1@`, `jane+2@`). | Limit key drops the `+tag`. TypeScript and PHP, tests. |
| 6 | Low | A blank `withdraw-label` or `confirm-label` gave a button with no words (Art. 11a(1) and (3) require the label). | Blank values fall back to the official wording. |
| 7 | Low | WooCommerce looked orders up by ID, not by the order number the consumer sees; with custom order numbers a note could land on another order of the same customer. | The order number must match; `cooloff_find_order` filter for custom numbering. |
| 8 | Low | WooCommerce settings are saved through `options.php`, which needs `manage_options`; shop managers could see but not save them. | `option_page_capability_cooloff-withdrawals` returns `manage_woocommerce`. |
| 9 | Low | Medusa dropped `storeCors` entries with a trailing slash, and a wrong `allowedOrigins` only showed as a 500 on every submission. | Origins normalised; `allowedOrigins` checked when Medusa starts. |
| 10 | Low | `@afkzona/cooloff-medusa` depends on `file:../..`; published like that it cannot be installed. | `prepublishOnly` refuses to publish with a `file:` dependency. How to publish: see open decisions. |
| 11 | Low | The file store accepted a directory owned by another user (only group and other write bits were checked). | Owner must be the process user or root. |
| 12 | Low | Removing the subject cleaning did not fail any test. | Test with a message override that contains CRLF and U+2028. |
| 13 | Low | README presented "without logging in" as a legal rule and SECURITY.md said the law requires a login-free function. Recital 37 gives downloading an app as the example. | Reworded. Added the limitation that a statement does not prove who sent it, and two accepted risks: the acknowledgement as a relay for typed text, and use of the recipient limit to delay one consumer's acknowledgement. |

### Checked, no change

- Origin check: every bypass above refused; only an exact allowed origin, or
  `Sec-Fetch-Site: same-origin` without `Origin`, passes.
- Receipt IDs: HMAC-SHA-256, 80 bits, secret of at least 32 bytes; not used
  for lookups. Idempotency: same key with other content answers 409.
- E-mail: CRLF, commas and quotes in addresses refused; every HTML value
  escaped. The control-character check in `isValidEmail` is a second layer:
  the local-part and domain patterns already refuse every character it
  covers, so removing it fails no test.
- WooCommerce: nonces checked by core for logged-in users, origin check before
  anything is stored, all queries prepared, all output escaped, admin page
  requires `manage_woocommerce`, the My account placement relies on
  WooCommerce's own order ownership check.
- Medusa: `/admin` routes need an authenticated user; the admin filter is
  allow-listed; publishable key and store CORS apply to the store route.

### Mutation check

Origin check, `null` origin, `Sec-Fetch-Site` rule, content type, streamed
body limit, HTML escaping, subject cleaning, unknown fields, IPv6 key, use of
the key in the handler, recipient limit, plus-tag key, idempotency conflict,
retry window, retry of acknowledged records, Next.js address requirement,
reserved headers, endpoint scheme, blank labels, directory permissions,
directory owner, generic 500, Medusa handler cache, PHP IPv6 key, PHP
plus-tag key: **all fail at least one test**. The e-mail control-character
layer survives, as explained above.

### Results

- `npm run check`: type check, lint and 377 tests pass; 98.8 % of lines
  covered.
- WooCommerce: 53 PHPUnit tests, PHPCS clean, 53 end-to-end checks pass
  (WordPress and WooCommerce in Docker).
- Medusa: type checks, 12 unit tests, 36 end-to-end checks pass (Medusa 2.22
  and PostgreSQL 17 in Docker).
- Publish gate: one author and committer, no tool names or co-author lines in
  history or tracked files.

### Open decisions for the owner

1. **Publishing the Medusa package.** Publish `@afkzona/cooloff` first, then
   set the Medusa dependency to the exact version (`"0.1.0"`, in line with
   exact pins) and refresh its lockfile; or turn the repository into npm
   workspaces so the version is set in one place.
2. **Recipient limit.** 5 e-mails per address and hour, retries for 72 hours.
   A stricter limit protects inboxes better but lets an attacker delay one
   consumer's acknowledgement longer. Keep, or change the numbers.
3. **Acknowledgement as a relay.** The law requires the content in the
   acknowledgement, so the typed name, contract and items go to the typed
   address. Options: keep as is (limited per client and recipient), add a
   global cap of e-mails per hour, or leave out the items line when partial
   withdrawal is off (it already says "whole contract").
4. **Logged-in submissions.** WooCommerce could record that a statement came
   from the logged-in owner of the order and show it in the admin list, to
   help shops judge a statement. Not built.
5. **PHP without `intl`.** Without the `Normalizer` class, text is not
   NFC-normalised, so a decomposed name is stored as typed. Require `intl`, or
   accept.
