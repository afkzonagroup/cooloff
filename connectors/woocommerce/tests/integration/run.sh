#!/bin/sh
# End-to-end test of the WooCommerce plugin in a real WordPress + WooCommerce
# install (Docker: wordpress:php8.3-apache, wordpress:cli-php8.3, mariadb:11).
# Needs network access to download WooCommerce from wordpress.org.
# Everything is removed at the end.
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
plugin="$(cd "$here/../../cooloff" && pwd)"
id="cooloff-it-$$"
port="${COOLOFF_IT_PORT:-8089}"
site="http://localhost:$port"
api="$site/wp-json/cooloff/v1/withdrawals"
pass=0
fail=0

cleanup() {
  docker rm -f "$id-wp" "$id-db" >/dev/null 2>&1 || true
  docker volume rm "$id-html" >/dev/null 2>&1 || true
  docker network rm "$id" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
tmp="$(mktemp -d)"
trap cleanup EXIT INT TERM

check() { # name expected actual
  if [ "$2" = "$3" ]; then pass=$((pass + 1)); echo "ok   $1"; else fail=$((fail + 1)); echo "FAIL $1: expected [$2] got [$3]"; fi
}
contains() { # name needle file
  if grep -qF -- "$2" "$3"; then pass=$((pass + 1)); echo "ok   $1"; else fail=$((fail + 1)); echo "FAIL $1: [$2] not found"; fi
}
absent() { # name needle file
  if grep -qF -- "$2" "$3"; then fail=$((fail + 1)); echo "FAIL $1: [$2] found"; else pass=$((pass + 1)); echo "ok   $1"; fi
}
wp() { docker run --rm -u 33:33 --network "$id" --volumes-from "$id-wp" -e WORDPRESS_DB_HOST="$id-db" -e WORDPRESS_DB_USER=wp -e WORDPRESS_DB_PASSWORD=wp -e WORDPRESS_DB_NAME=wp wordpress:cli-php8.3 wp "$@"; }
post() { # body [extra curl args...] -> writes body to $tmp/out, prints status
  body="$1"; shift
  curl -s -o "$tmp/out" -w '%{http_code}' -X POST "$api" -H 'Content-Type: application/json' "$@" --data-binary "$body"
}
body() { # name contract email key [extra json]
  printf '{"name":"%s","contract":"%s","email":"%s","idempotencyKey":"%s"%s}' "$1" "$2" "$3" "$4" "${5:-}"
}

echo "Starting WordPress and MariaDB"
docker network create "$id" >/dev/null
docker volume create "$id-html" >/dev/null
docker run -d --name "$id-db" --network "$id" -e MARIADB_ROOT_PASSWORD=root -e MARIADB_DATABASE=wp -e MARIADB_USER=wp -e MARIADB_PASSWORD=wp mariadb:11 >/dev/null
docker run -d --name "$id-wp" --network "$id" -p "127.0.0.1:$port:80" \
  -e WORDPRESS_DB_HOST="$id-db" -e WORDPRESS_DB_USER=wp -e WORDPRESS_DB_PASSWORD=wp -e WORDPRESS_DB_NAME=wp \
  -v "$id-html":/var/www/html \
  -v "$plugin":/var/www/html/wp-content/plugins/cooloff:ro \
  -v "$here/mu-capture-mail.php":/var/www/html/wp-content/mu-plugins/cooloff-test-mail.php:ro \
  wordpress:php8.3-apache >/dev/null

for _ in $(seq 1 90); do
  if docker exec "$id-wp" test -f /var/www/html/wp-config.php 2>/dev/null && wp db check >/dev/null 2>&1; then break; fi
  sleep 2
done

wp core install --url="$site" --title="Cooloff Test Shop" --admin_user=admin --admin_password=admin-pass-123 --admin_email=admin@example.eu --skip-email >/dev/null
wp option update timezone_string Europe/Vilnius >/dev/null
wp rewrite structure '/%postname%/' >/dev/null
wp plugin install woocommerce --activate >/dev/null 2>&1
wp plugin activate cooloff >/dev/null
wp user create jane jane@example.eu --role=customer --user_pass=jane-pass-123 --first_name=Jane --last_name=Doe >/dev/null
wp user create sub sub@example.eu --role=subscriber --user_pass=sub-pass-123 >/dev/null
order_id="$(wp eval '$o = wc_create_order( array( "customer_id" => get_user_by( "login", "jane" )->ID ) ); $o->set_billing_email( "jane@example.eu" ); $o->set_billing_first_name( "Jane" ); $o->set_billing_last_name( "Doe" ); $o->set_status( "completed" ); $o->save(); echo $o->get_id();')"
echo "WooCommerce $(wp plugin get woocommerce --field=version), order $order_id"

echo "Tests"
check "plugin active" "active" "$(wp plugin get cooloff --field=status)"
check "table created" "1" "$(wp db query "SHOW TABLES LIKE 'wp_cooloff_withdrawals'" --skip-column-names | grep -c cooloff_withdrawals)"

s="$(post "$(body 'Jane Doe' "$order_id" jane@example.eu k_integration_0001)" -H "Origin: $site")"
check "201 for a valid statement" "201" "$s"
cp "$tmp/out" "$tmp/first"
contains "receipt id returned" '"receiptId":"WD-' "$tmp/out"
contains "local time in shop time zone" '"timeZone":"Europe\/Vilnius"' "$tmp/out"
contains "acknowledgement sent" '"acknowledgement":"sent"' "$tmp/out"
receipt="$(sed -E 's/.*"receiptId":"([^"]+)".*/\1/' "$tmp/out")"
check "row stored with order link" "$order_id" "$(wp db query "SELECT order_id FROM wp_cooloff_withdrawals WHERE receipt_id='$receipt'" --skip-column-names)"
docker exec "$id-wp" sh -c 'cat /var/www/html/wp-content/uploads/cooloff-mails/*.json' > "$tmp/mail"
contains "mail to consumer" '"to":"jane@example.eu"' "$tmp/mail"
contains "mail has receipt" "$receipt" "$tmp/mail"
contains "mail is HTML" 'text\/html' "$tmp/mail"
contains "order note added" "$receipt" "$(wp eval "foreach ( wc_get_order_notes( array( 'order_id' => $order_id ) ) as \$n ) echo \$n->content, PHP_EOL;" > "$tmp/notes"; echo "$tmp/notes")"

s="$(post "$(body 'Jane Doe' "$order_id" jane@example.eu k_integration_0001)" -H "Origin: $site")"
check "200 for a repeated submission" "200" "$s"
check "same receipt on repeat" "$receipt" "$(sed -E 's/.*"receiptId":"([^"]+)".*/\1/' "$tmp/out")"
check "stored once" "1" "$(wp db query "SELECT COUNT(*) FROM wp_cooloff_withdrawals WHERE receipt_id='$receipt'" --skip-column-names)"

check "409 for same key, other content" "409" "$(post "$(body 'Jane Doe' 999 jane@example.eu k_integration_0001)" -H "Origin: $site")"
check "403 for a foreign origin" "403" "$(post "$(body 'Jane' 1 jane@example.eu k_integration_0002)" -H 'Origin: https://evil.example')"
check "403 without origin" "403" "$(post "$(body 'Jane' 1 jane@example.eu k_integration_0003)")"
check "415 for text/plain" "415" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$api" -H "Origin: $site" -H 'Content-Type: text/plain' --data-binary "$(body Jane 1 jane@example.eu k_integration_0004)")"
big="$(head -c 20000 /dev/zero | tr '\0' 'x')"
check "413 for a large body" "413" "$(post "$(body "$big" 1 jane@example.eu k_integration_0005)" -H "Origin: $site")"
s="$(post '{"name":"","contract":"1","email":"<script>@x","idempotencyKey":"k_integration_0006"}' -H "Origin: $site")"
check "400 for invalid fields" "400" "$s"
contains "field errors returned" '{"field":"email","code":"invalid_email"}' "$tmp/out"
absent "input not echoed" '<script>' "$tmp/out"
check "400 for unknown fields" "400" "$(post "$(body Jane 1 jane@example.eu k_integration_0007 ',"admin":true')" -H "Origin: $site")"
check "GET is not routed (404)" "404" "$(curl -s -o /dev/null -w '%{http_code}' "$api")"

# Mail failure: the withdrawal is kept and the acknowledgement is retried on resubmission.
docker exec -u 33 "$id-wp" touch /var/www/html/wp-content/uploads/cooloff-mail-fail
post "$(body 'Mail Fail' 2 mf@example.eu k_integration_mail1)" -H "Origin: $site" >/dev/null
contains "pending when mail fails" '"acknowledgement":"pending"' "$tmp/out"
docker exec -u 33 "$id-wp" rm /var/www/html/wp-content/uploads/cooloff-mail-fail
post "$(body 'Mail Fail' 2 mf@example.eu k_integration_mail1)" -H "Origin: $site" >/dev/null
contains "sent on retry" '"acknowledgement":"sent"' "$tmp/out"

# Pending acknowledgements are retried by WP-Cron without a new submission.
check "retry is scheduled" "cooloff_retry_acknowledgements" "$(wp cron event list --fields=hook --format=csv | grep -o cooloff_retry_acknowledgements | head -1)"
docker exec -u 33 "$id-wp" touch /var/www/html/wp-content/uploads/cooloff-mail-fail
post "$(body 'Cron Retry' 2 cron@example.eu k_integration_cron1)" -H "Origin: $site" >/dev/null
contains "pending while mail fails" '"acknowledgement":"pending"' "$tmp/out"
docker exec -u 33 "$id-wp" rm /var/www/html/wp-content/uploads/cooloff-mail-fail
wp cron event run cooloff_retry_acknowledgements >/dev/null 2>&1
check "cron retry sent the acknowledgement" "1" "$(wp db query "SELECT COUNT(*) FROM wp_cooloff_withdrawals WHERE email='cron@example.eu' AND acknowledged_at IS NOT NULL" --skip-column-names)"
docker exec "$id-wp" sh -c 'cat /var/www/html/wp-content/uploads/cooloff-mails/*.json' > "$tmp/mail2"
contains "cron retry mail to the consumer" '"to":"cron@example.eu"' "$tmp/mail2"

# Stored XSS: values are escaped in the admin list.
post "$(body '<script>alert(1)</script>' '\"><img src=x onerror=alert(2)>' xss@example.eu k_integration_xss01)" -H "Origin: $site" >/dev/null
wp eval 'wp_set_current_user( 1 ); \Cooloff\Admin::page();' > "$tmp/admin" 2>&1
contains "admin list escapes name" '&lt;script&gt;alert(1)&lt;/script&gt;' "$tmp/admin"
absent "no raw script in admin" '<script>alert(1)' "$tmp/admin"
absent "no raw img in admin" '<img src=x' "$tmp/admin"

# Capability check on the admin page.
wp eval 'wp_set_current_user( get_user_by( "login", "sub" )->ID ); \Cooloff\Admin::page();' > "$tmp/sub" 2>&1 || true
contains "subscriber is refused" 'You do not have permission' "$tmp/sub"
absent "subscriber sees no data" 'jane@example.eu' "$tmp/sub"

# Shortcode output: attributes escaped, nonce only for logged-in users, official label language.
wp eval 'echo do_shortcode( "[cooloff_withdrawal contract=\"x\\\"><script>alert(3)</script>\"]" );' > "$tmp/sc" 2>&1
contains "shortcode renders the element" '<withdrawal-button endpoint="' "$tmp/sc"
absent "shortcode escapes contract" '<script>alert(3)' "$tmp/sc"
absent "no nonce for guests" 'header-value' "$tmp/sc"
wp eval 'wp_set_current_user( get_user_by( "login", "jane" )->ID ); echo do_shortcode( "[cooloff_withdrawal]" );' > "$tmp/sc2" 2>&1
contains "prefill for logged-in consumer" 'prefill-email="jane@example.eu"' "$tmp/sc2"
contains "nonce header for logged-in consumer" 'header-name="X-WP-Nonce"' "$tmp/sc2"

# Logged-in consumer through the browser flow: cookie + wp_rest nonce from the page.
page_id="$(wp post create --post_type=page --post_status=publish --post_title=Withdraw --post_content='[cooloff_withdrawal]' --porcelain)"
curl -s -c "$tmp/jar" -o /dev/null -d 'log=jane&pwd=jane-pass-123&testcookie=1' -b 'wordpress_test_cookie=WP%20Cookie%20check' "$site/wp-login.php"
curl -s -L -b "$tmp/jar" "$site/?page_id=$page_id" > "$tmp/page"
contains "page has the element" '<withdrawal-button' "$tmp/page"
contains "page loads the module" 'assets/cooloff/component/define.js' "$tmp/page"
nonce="$(grep -o 'header-value="[^"]*"' "$tmp/page" | head -1 | cut -d'"' -f2)"
case "$nonce" in ??????????) n=yes ;; *) n=no ;; esac
check "page carries a wp_rest nonce for the logged-in consumer" "yes" "$n"
check "403 with a bad nonce" "403" "$(post "$(body Jane 1 jane@example.eu k_integration_nonce1)" -H "Origin: $site" -b "$tmp/jar" -H 'X-WP-Nonce: 0000000000')"
check "201 with the page nonce" "201" "$(post "$(body Jane 1 jane@example.eu k_integration_nonce2)" -H "Origin: $site" -b "$tmp/jar" -H "X-WP-Nonce: $nonce")"
check "logged-in request is authenticated" "1" "$(wp db query "SELECT COUNT(*) FROM wp_cooloff_withdrawals WHERE email='jane@example.eu' AND contract='1'" --skip-column-names)"
check "module file served" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$site/wp-content/plugins/cooloff/assets/cooloff/component/define.js")"

# Recipient limit: at most 5 acknowledgement e-mails per address and hour; every withdrawal is stored.
states=""
for n in 1 2 3 4 5 6 7; do
  post "$(body Limit 3 limit@example.eu "k_integration_mail_limit_$n")" -H "Origin: $site" >/dev/null
  case "$(cat "$tmp/out")" in *'"acknowledgement":"sent"'*) states="$states sent" ;; *) states="$states pending" ;; esac
done
check "recipient limit holds back e-mails" " sent sent sent sent sent pending pending" "$states"
check "all seven withdrawals stored" "7" "$(wp db query "SELECT COUNT(*) FROM wp_cooloff_withdrawals WHERE email='limit@example.eu'" --skip-column-names)"
post "$(body Limit 3 limit+tag@example.eu k_integration_mail_limit_tag)" -H "Origin: $site" >/dev/null
contains "a plus tag does not reset the recipient limit" '"acknowledgement":"pending"' "$tmp/out"

# Rate limit: 10 per minute per client address.
codes=""
for n in 1 2 3 4 5 6 7 8 9 10 11 12; do codes="$codes $(post "$(body Jane 1 jane@example.eu "k_integration_rl_$n")" -H "Origin: $site" -H 'X-Test-Client: rate-limit-test')"; done
check "first ten allowed, then 429" " 201 201 201 201 201 201 201 201 201 201 429 429" "$codes"
codes=""
for n in 1 2 3 4 5 6 7 8 9 a b; do codes="$codes $(post "$(body Jane 1 jane@example.eu "k_integration_v6_$n")" -H "Origin: $site" -H "X-Test-Client: 2001:db8:5:6::$n")"; done
check "one IPv6 /64 counts as one client" " 201 201 201 201 201 201 201 201 201 201 429" "$codes"

check "shop managers may save the settings" "manage_woocommerce" "$(wp eval '\Cooloff\Admin::register(); echo apply_filters( "option_page_capability_cooloff-withdrawals", "manage_options" );')"

# Optional hook for manual checks (for example screenshots) while the site is up.
if [ -n "${COOLOFF_IT_AFTER:-}" ]; then
  COOLOFF_IT_SITE="$site" COOLOFF_IT_PAGE="$site/?page_id=$page_id" COOLOFF_IT_ORDER="$order_id" sh -c "$COOLOFF_IT_AFTER"
fi

echo "Passed $pass, failed $fail"
[ "$fail" -eq 0 ]
