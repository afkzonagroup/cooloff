=== Cooloff withdrawal function ===
Contributors: afkzona
Tags: withdrawal, consumer rights, right of withdrawal, eu, woocommerce
Requires at least: 6.5
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 0.1.0
License: Apache-2.0
License URI: https://www.apache.org/licenses/LICENSE-2.0

The withdrawal function of Article 11a of the Consumer Rights Directive 2011/83/EU, added by Directive (EU) 2023/2673 and applicable from 19 June 2026.

== Description ==

Adds a "withdraw from contract here" button, a short form for the withdrawal statement, a "confirm withdrawal" step and an acknowledgement of receipt by e-mail.

* Button and confirmation labels use the official wording of Article 11a in all 24 EU languages, chosen from the site language.
* The form asks for name, order number and e-mail address. Logged-in customers only confirm what is pre-filled.
* The acknowledgement e-mail contains the withdrawal statement and the date and time of submission, in the shop time zone and in UTC.
* Withdrawals are stored in a table of their own and listed under WooCommerce > Withdrawals. A private note is added to the matching order.
* Works for guests and logged-in customers.

This plugin does not make a shop compliant on its own and is not legal advice. Placement, the withdrawal period, refunds and the rest of the consumer rights rules remain the shop's responsibility.

Interface texts other than the two official labels are working translations that need review by native speakers.

== Installation ==

1. Upload the plugin and activate it. WooCommerce must be active.
2. Check WooCommerce > Withdrawals > Settings.
3. The button appears on order pages in My account. For guests, create a page with the shortcode `[cooloff_withdrawal]` and link it prominently, for example in the footer and in order e-mails.
4. Optional: set `define( 'COOLOFF_SECRET', '...' );` in wp-config.php (at least 32 characters). Otherwise a random secret is created on activation.

== Frequently Asked Questions ==

= What if an acknowledgement e-mail cannot be sent? =

The withdrawal is stored and the e-mail is retried every 15 minutes by WP-Cron (hook `cooloff_retry_acknowledgements`) for up to 72 hours. WP-Cron runs on page visits; on quiet sites, run it from a real cron job.

= Does it work with page caching? =

Yes for guests. Logged-in customers carry a WordPress REST nonce, so pages for logged-in users must not be cached (the default for most caching plugins).

= Filters =

* `cooloff_allowed_origins`: extra origins allowed to submit (array of URLs).
* `cooloff_client_address`: client address used for rate limiting (behind a trusted proxy).
* `cooloff_rate_limit`: `array( 'limit' => 10, 'window' => 60 )`.
* `cooloff_find_order`: return the WC_Order for an order number if you use custom order numbers.
* Action `cooloff_withdrawal_received`: runs once per new withdrawal.

== Changelog ==

= 0.1.0 =
* First release.
