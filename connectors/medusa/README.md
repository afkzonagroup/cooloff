# Cooloff for Medusa

Medusa v2 plugin for the withdrawal function of Article 11a of the Consumer
Rights Directive 2011/83/EU (inserted by Directive (EU) 2023/2673, applicable
from 19 June 2026).

It adds `POST /store/cooloff/withdrawals`, stores withdrawals in PostgreSQL,
sends the acknowledgement of receipt through Medusa's Notification Module,
links withdrawals to orders, and adds a Withdrawals page and an order widget
to the admin.

```ts
// medusa-config.ts
plugins: [
  {
    resolve: '@afkzona/cooloff-medusa',
    options: { traderName: 'Example Shop', timeZone: 'Europe/Vilnius' },
  },
],
```

Set `COOLOFF_SECRET` (at least 32 bytes) in the environment and run
`npx medusa db:migrate`. On the storefront, use the `<withdrawal-button>`
component from `@afkzona/cooloff` with your publishable API key:

```html
<withdrawal-button
  endpoint="https://api.shop.example/store/cooloff/withdrawals"
  header-name="x-publishable-api-key"
  header-value="pk_..."></withdrawal-button>
```

Full documentation, the legal mapping, limitations and the security model are
in the [main README](../../README.md).

This is not legal advice. Apache License 2.0. Copyright 2026 MB AFKzona Group.
