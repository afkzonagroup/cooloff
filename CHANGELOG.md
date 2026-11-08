# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-08

### Added

- Core: official labels of Article 11a(1) and (3) in all 24 EU languages,
  verbatim from EUR-Lex; request validation and normalisation; deterministic
  receipt IDs; acknowledgement of receipt with the date and time of submission
  in UTC and in the shop's time zone; e-mail rendering with escaping.
- `<withdrawal-button>` web component: two steps, Shadow DOM, constructable
  stylesheets, works under a strict CSP, keyboard and screen-reader support.
- Server: Fetch API handler with origin check, rate limiting, body size limit,
  strict JSON content type, idempotency and security headers. Adapters for
  Node `http`, Express and Next.js route handlers.
- Stores: in-memory and append-only JSON Lines file store.
- Per-recipient limit on acknowledgement e-mails; sub-address tags
  (`jane+1@`) share the limit of the address.
- `retryPendingAcknowledgements()` on every handler, and scheduled retries in
  the WooCommerce (WP-Cron) and Medusa (scheduled job) plugins.
- Rate limiting counts an IPv6 /64 network as one client
  (`clientRateLimitKey`).
- WooCommerce plugin.
- Medusa v2 plugin (`@afkzona/cooloff-medusa`) with an admin page and order widget.
- Example shop page (`npm run example`).
