# Security

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub Security Advisories:
open the repository's **Security** tab and choose **Report a vulnerability**.
Do not open a public issue. If you cannot use GitHub, e-mail
info@afkzonagroup.lt with "Cooloff security" in the subject.

We confirm receipt within three working days, agree a fix and disclosure date
with you, and credit you unless you prefer otherwise.

Supported versions: the latest minor release.

## Threat model

### Assets

- **Withdrawal records**: name, contract details and e-mail address of
  consumers (personal data), the time of submission and the receipt ID. They
  can be evidence that a consumer withdrew in time (Art. 11a(5) of Directive
  2011/83/EU).
- **The acknowledgement e-mail**: reaches the consumer's inbox in the shop's
  name.
- **The secret**: keys receipt IDs and idempotency storage keys.
- **The shop's pages**: the component runs inside them.

### Actors

- Consumers, logged in or not. They are the intended users.
- Anonymous internet clients, including bots and attackers.
- Malicious third-party websites visited by consumers (cross-site requests).
- Shop operators and developers who configure Cooloff (trusted).
- Contributors to this repository (trusted after review; see supply chain).

### Trust boundaries

1. Browser to server: every request body and header is untrusted.
2. Server to store: the store is trusted, but data read back from a log file
   is validated again.
3. Server to mail transport: the rendered e-mail leaves the system.
4. Page to component: attributes are set by the shop (trusted), values typed
   by the consumer are untrusted, server responses are validated before use.

### Threats and mitigations

| Threat | Mitigation | Where |
|---|---|---|
| Cross-site request forgery: a third-party page submits a withdrawal in a consumer's name. | Origin check: `Origin` must be an allowed origin; without `Origin`, `Sec-Fetch-Site: same-origin` is required. Only `application/json` is accepted, which HTML forms cannot send and which forces a CORS preflight; the handler sends no CORS headers. An origin check was chosen over a token because consumers are often not logged in and shop pages are often cached, so there is no session to bind a token to. | `src/server/http.ts`, `handler.ts`; WooCommerce `class-rest.php` |
| Flooding: many submissions to fill storage or the consumer's inbox. | Rate limit per client address before the body is read (default 10 per minute); IPv6 clients are counted per /64 network, because one client usually holds a whole /64; IPv4-mapped IPv6 addresses count as IPv4. Body limit 16 KiB, checked against `Content-Length` and while streaming; at most 50 items. | `rate-limit.ts`, `http.ts`; WooCommerce `class-rate-limiter.php` |
| Inbox flooding: many statements with someone else's e-mail address. | Acknowledgement e-mails are limited per recipient address (default 5 per hour, keyed by an HMAC of the address in lower case with any `+tag` removed, so sub-addresses share one limit); statements are still stored. Plus the per-client rate limit. | `handler.ts`; WooCommerce `class-rest.php` |
| Rate limiter memory exhaustion. | At most 10 000 tracked keys; expired then oldest keys are dropped. | `rate-limit.ts` |
| Denial of the legal right through the rate limit. | Generous default, `Retry-After`, a clear message, and the limit is configurable. One shared rate-limit bucket would let a single client block everyone, so the Next.js adapter refuses to start without `clientAddress` (or `rateLimiter: false`). Consumers keep the other ways to withdraw (Annex I(B) form, e-mail). | `handler.ts`, `next.ts`, component |
| Acknowledgement never sent (mail failure, or held back by the recipient limit). | The record is kept with no `acknowledgedAt`. `retryPendingAcknowledgements()` sends pending ones (records up to 72 hours old by default); WooCommerce runs it from WP-Cron and Medusa from a scheduled job, both every 15 minutes. The recipient limit still applies to retries. | `handler.ts`; WooCommerce `class-rest.php`; Medusa `src/jobs/` |
| Malformed or hostile input (type confusion, prototype pollution, huge strings, invalid UTF-8). | Strict allow-list schema: plain objects only, unknown fields refused (including `__proto__`), type checks, length checks before and after normalisation, fatal UTF-8 decoding. Only own properties are read. | `src/core/schema.ts` |
| Spoofed display: bidirectional overrides, zero-width or control characters in names. | Removed during normalisation; refused in e-mail addresses. A repository test fails on such characters in source files. | `normalise.ts`, `schema.ts`, `test/source-hygiene.test.ts` |
| E-mail header injection. | E-mail addresses with line breaks or control characters are refused; the subject is cleaned and capped. No mail client is shipped. | `schema.ts`, `email.ts` |
| HTML injection in the acknowledgement e-mail. | Every dynamic value is escaped (`& < > " '`). | `email.ts`; WooCommerce `class-acknowledgement.php` |
| Cross-site scripting in the page. | DOM built with `createElement` and `textContent`; no `innerHTML`, `outerHTML` or `insertAdjacentHTML` (enforced by lint); Shadow DOM; works under `script-src 'self'; style-src 'self'`. Server responses are shape-checked before use. Endpoints other than `http(s)` are refused. | `src/component/` |
| Cross-site scripting in admin lists. | WooCommerce: `esc_html`/`esc_attr`/`esc_url` on every value. Medusa: React rendering. | connectors |
| SQL injection. | WooCommerce: `$wpdb->prepare`, `$wpdb->insert`, `$wpdb->update`. Medusa: the module service (MikroORM, parameterised). Admin filter input is allow-listed. | connectors |
| Duplicate records from retries or double clicks. | Idempotency key per form session; the stored key is an HMAC of it; repeated submissions return the original receipt; different content with the same key gets 409. Inserts are atomic per key. | `handler.ts`, stores |
| Forged or guessed receipt IDs. | HMAC-SHA-256 over the canonical statement with a secret of at least 32 bytes, 80 bits shown. Receipt IDs are not used to look anything up. | `receipt.ts` |
| Timing attacks on comparisons. | Constant-time comparison of receipt IDs (`timingSafeEqual`, `hash_equals`). | `receipt.ts`, `class-rest.php` |
| Leaking internals. | Fixed error codes only; 500 is `{"error":"internal_error"}`. The default error log line holds the error name only, never the body or personal data. | `handler.ts`, `node.ts` |
| Path traversal and symlink attacks on the log file. | Absolute directory only; file name allow-list (no separators, no `..`, no leading dot); resolved path checked to stay inside the directory; `O_NOFOLLOW`; the directory must not be a symlink; regular files only. | `file-store.ts` |
| Other local users reading or replacing the log. | File mode 0600 (tightened if looser); a new directory gets 0700; a directory writable by group or others is refused rather than changed, because it may be shared. | `file-store.ts` |
| Tampering with or truncating the log. | Append-only writes with `fsync`; a torn last line is skipped and the next write starts on a new line; malformed lines are skipped and counted, never trusted. The file is not cryptographically chained: protect it with your system's access control and backups. | `file-store.ts` |
| Secret disclosure. | Secrets come from configuration (environment, `wp-config.php`), are never logged and never sent to clients. Short secrets are refused. | `receipt.ts`, connectors |
| Clickjacking of the endpoint. | API responses carry `X-Frame-Options: DENY` and `frame-ancestors 'none'`. Protecting the shop page itself is the shop's job. | `http.ts` |
| Supply chain. | Zero runtime dependencies; exact version pins; committed lockfiles; `npm audit --omit=dev` in CI; CI runs on pull requests only with read-only permissions and pinned action SHAs; no install scripts; `files` allow-list in `package.json`. | repository |

### Data flows

1. The consumer types or confirms name, contract and e-mail in the page.
2. The browser sends them to your endpoint. Nothing goes to any third party.
3. The server stores the record in the store you configured and passes the
   rendered acknowledgement to the notifier you configured.
4. Your mail transport delivers it.

Cooloff has no telemetry and makes no network requests of its own. Medusa
itself has telemetry; disable it with `MEDUSA_DISABLE_TELEMETRY=true` if you
wish.

### Out of scope

- Authentication of consumers. The withdrawal function must work for guests;
  a statement is a notice from the consumer, not an authenticated action.
  The trader checks the details, as with a withdrawal by e-mail.
- The security of your mail transport, database and hosting.
- Distributed rate limiting across several processes (implement
  `RateLimiter` on a shared store).

### Known accepted risks

- A development-only dependency chain (`eslint` and `typescript-eslint`
  through `minimatch`) has a moderate advisory for denial of service with
  crafted glob patterns. It runs only on the repository's own files during
  development and is not shipped. `npm audit --omit=dev` is clean.
- Anyone can submit a statement for any contract number. This is inherent in
  a withdrawal function that also works for guests and without login. The
  acknowledgement goes to the address given, the record shows what was sent,
  and the WooCommerce and Medusa connectors only link a statement to an order
  when the order number and the order's e-mail address both match.
  A statement is therefore not proof of who sent it: check it before you
  refund or cancel, as you would a withdrawal by e-mail.
- The acknowledgement repeats what the sender typed (name, contract, items)
  and goes to the address the sender typed. Someone can use the endpoint to
  make your shop send a short message with their text to any address. The
  per-client and per-recipient limits bound this; the HTML is escaped and
  links are never created, but mail clients may still turn a typed URL into a
  link.
- Someone who knows a consumer's e-mail address can use up that address's
  recipient limit, so the consumer's own acknowledgement is held back. The
  statement is still stored with its time of submission, and the scheduled
  retry sends it once the limit allows.
