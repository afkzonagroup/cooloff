#!/bin/sh
# End-to-end test of the Medusa plugin in a real Medusa 2 application with
# PostgreSQL in Docker. Builds the plugin, migrates, seeds, starts the server
# and checks the store and admin routes. Everything is removed at the end.
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
plugin="$(cd "$here/.." && pwd)"
app="$here/app"
id="cooloff-medusa-it-$$"
dbport="${COOLOFF_IT_DB_PORT:-55433}"
port="${COOLOFF_IT_PORT:-9123}"
base="http://localhost:$port"
origin="http://localhost:8000"
tmp="$(mktemp -d)"
pass=0
fail=0
server_pid=""

cleanup() {
  if [ -n "${COOLOFF_IT_LOG:-}" ] && [ -f "$tmp/server.log" ]; then cp "$tmp/server.log" "$COOLOFF_IT_LOG"; fi
  if [ -n "$server_pid" ]; then kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; fi
  # The Medusa CLI starts child processes that outlive their parent; stop them.
  pkill -f "$plugin/node_modules/.bin/medusa (start|develop)" 2>/dev/null || true
  pids="$(lsof -ti "tcp:$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then kill $pids 2>/dev/null || true; fi
  # The Medusa CLI starts the server as a child process; stop whatever still listens on the test port.
  pids="$(lsof -ti "tcp:$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then kill $pids 2>/dev/null || true; fi
  docker rm -f "$id-db" >/dev/null 2>&1 || true
  rm -rf "$tmp" "$app/.medusa" "$app/node_modules"
}
trap cleanup EXIT INT TERM

check() { if [ "$2" = "$3" ]; then pass=$((pass + 1)); echo "ok   $1"; else fail=$((fail + 1)); echo "FAIL $1: expected [$2] got [$3]"; fi; }
contains() { if grep -qF -- "$2" "$3"; then pass=$((pass + 1)); echo "ok   $1"; else fail=$((fail + 1)); echo "FAIL $1: [$2] not found"; fi; }
absent() { if grep -qF -- "$2" "$3"; then fail=$((fail + 1)); echo "FAIL $1: [$2] found"; else pass=$((pass + 1)); echo "ok   $1"; fi; }
sql() { docker exec "$id-db" psql -U postgres -d medusa -tAc "$1"; }

export MEDUSA_DISABLE_TELEMETRY=true
export DATABASE_URL="postgres://postgres:postgres@127.0.0.1:$dbport/medusa"
export COOLOFF_SECRET="medusa-e2e-test-secret-0123456789abcdef"
export STOREFRONT_ORIGIN="$origin"
export NODE_ENV=development
# Low enough to test the limit; the other checks send fewer requests from one address.
export COOLOFF_RATE_LIMIT=12

if lsof -ti "tcp:$port" >/dev/null 2>&1; then echo "Port $port is in use; stop that process or set COOLOFF_IT_PORT" >&2; exit 1; fi

echo "Building plugin"
(cd "$plugin" && npx medusa plugin:build >/dev/null)

# Install the plugin into the test app by name, as a shop would (a link to this folder).
mkdir -p "$app/node_modules/@afkzona"
ln -sfn "$plugin" "$app/node_modules/@afkzona/cooloff-medusa"

echo "Starting PostgreSQL"
docker run -d --name "$id-db" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=medusa -p "127.0.0.1:$dbport:5432" postgres:17-alpine >/dev/null
for _ in $(seq 1 30); do docker exec "$id-db" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
sleep 2

echo "Migrating and seeding"
(cd "$app" && npx medusa db:migrate >"$tmp/migrate.log" 2>&1) || { cat "$tmp/migrate.log"; exit 1; }
(cd "$app" && SEED_OUTPUT="$tmp/seed.json" npx medusa exec ./src/seed.ts >"$tmp/seed.log" 2>&1) || { cat "$tmp/seed.log"; exit 1; }
key="$(sed -E 's/.*"publishableKey":"([^"]+)".*/\1/' "$tmp/seed.json")"
order="$(sed -E 's/.*"orderDisplayId":([0-9]+).*/\1/' "$tmp/seed.json")"
order_id="$(sed -E 's/.*"orderId":"([^"]+)".*/\1/' "$tmp/seed.json")"

(cd "$app" && npx medusa user -e admin@example.eu -p admin-pass-123 >"$tmp/user.log" 2>&1) || { cat "$tmp/user.log"; exit 1; }

if lsof -ti "tcp:$port" >/dev/null 2>&1; then echo "Port $port is in use" >&2; exit 1; fi
echo "Starting Medusa on $base"
# COOLOFF_ADMIN=1 also serves the admin dashboard (development server) for manual checks.
if [ "${COOLOFF_ADMIN:-}" = "1" ]; then mode=develop; else mode=start; fi
(cd "$app" && PORT="$port" npx medusa "$mode" >"$tmp/server.log" 2>&1) &
server_pid=$!
for _ in $(seq 1 180); do curl -s -o /dev/null "$base/health" && break; sleep 1; done

api="$base/store/cooloff/withdrawals"
post() { body="$1"; shift; curl -s -o "$tmp/out" -w '%{http_code}' -X POST "$api" -H 'Content-Type: application/json' -H "x-publishable-api-key: $key" "$@" --data-binary "$body"; }
body() { printf '{"name":"%s","contract":"%s","email":"%s","idempotencyKey":"%s"%s}' "$1" "$2" "$3" "$4" "${5:-}"; }

echo "Tests"
check "table migrated" "cooloff_withdrawal" "$(sql "select table_name from information_schema.tables where table_name='cooloff_withdrawal'")"
check "201 for a valid statement" "201" "$(post "$(body 'Jane Doe' "$order" jane@example.eu k_medusa_e2e_0001)" -H "Origin: $origin")"
contains "receipt returned" '"receiptId":"WD-' "$tmp/out"
contains "shop time zone" '"timeZone":"Europe/Vilnius"' "$tmp/out"
contains "acknowledgement sent" '"acknowledgement":"sent"' "$tmp/out"
receipt="$(sed -E 's/.*"receiptId":"([^"]+)".*/\1/' "$tmp/out")"
check "row stored" "1" "$(sql "select count(*) from cooloff_withdrawal where receipt_id='$receipt'")"
check "linked to the order" "$order_id" "$(sql "select order_id from cooloff_withdrawal where receipt_id='$receipt'")"
check "acknowledged_at set" "1" "$(sql "select count(*) from cooloff_withdrawal where receipt_id='$receipt' and acknowledged_at is not null")"
check "notification recorded for the consumer" "1" "$(sql "select count(*) from notification where \"to\"='jane@example.eu' and template='cooloff-withdrawal-acknowledgement'")"
check "200 on repeat, same receipt" "200" "$(post "$(body 'Jane Doe' "$order" jane@example.eu k_medusa_e2e_0001)" -H "Origin: $origin")"
contains "same receipt on repeat" "$receipt" "$tmp/out"
check "stored once" "1" "$(sql "select count(*) from cooloff_withdrawal where receipt_id='$receipt'")"
check "409 for same key, other content" "409" "$(post "$(body 'Jane Doe' 999 jane@example.eu k_medusa_e2e_0001)" -H "Origin: $origin")"
check "403 for a foreign origin" "403" "$(post "$(body Jane 1 jane@example.eu k_medusa_e2e_0002)" -H 'Origin: https://evil.example')"
check "403 without origin" "403" "$(post "$(body Jane 1 jane@example.eu k_medusa_e2e_0003)")"
check "415 for text/plain" "415" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$api" -H "Origin: $origin" -H "x-publishable-api-key: $key" -H 'Content-Type: text/plain' --data-binary "$(body Jane 1 jane@example.eu k_medusa_e2e_0004)")"
big="$(head -c 20000 /dev/zero | tr '\0' 'x')"
check "413 for a large body" "413" "$(post "$(body "$big" 1 jane@example.eu k_medusa_e2e_0005)" -H "Origin: $origin")"
check "400 for invalid fields" "400" "$(post '{"name":"","contract":"1","email":"<script>@x","idempotencyKey":"k_medusa_e2e_0006"}' -H "Origin: $origin")"
contains "field error" '{"field":"email","code":"invalid_email"}' "$tmp/out"
absent "input not echoed" '<script>' "$tmp/out"
check "publishable key required" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$api" -H "Origin: $origin" -H 'Content-Type: application/json' --data-binary "$(body Jane 1 jane@example.eu k_medusa_e2e_0007)")"
check "partial withdrawal accepted" "201" "$(post "$(body Jane 1 jane@example.eu k_medusa_e2e_0008 ',"items":["Running shoes"]')" -H "Origin: $origin")"
check "items stored" '["Running shoes"]' "$(sql "select items::text from cooloff_withdrawal where storage_key in (select storage_key from cooloff_withdrawal order by created_at desc limit 1)")"
curl -s -o /dev/null -D "$tmp/preflight" -X OPTIONS "$api" -H "Origin: $origin" -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type,x-publishable-api-key'
contains "CORS preflight allows the storefront" "Access-Control-Allow-Origin: $origin" "$tmp/preflight"
curl -s -o /dev/null -D "$tmp/preflight2" -X OPTIONS "$api" -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: POST'
absent "CORS preflight refuses other origins" "Access-Control-Allow-Origin: https://evil.example" "$tmp/preflight2"
check "admin list requires auth" "401" "$(curl -s -o /dev/null -w '%{http_code}' "$base/admin/cooloff/withdrawals")"
post "$(body '<script>alert(1)</script>' 2 xss@example.eu k_medusa_e2e_xss1)" -H "Origin: $origin" >/dev/null
token="$(curl -s -X POST "$base/auth/user/emailpass" -H 'Content-Type: application/json' -d '{"email":"admin@example.eu","password":"admin-pass-123"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')"
check "admin list with a token" "200" "$(curl -s -o "$tmp/admin" -w '%{http_code}' "$base/admin/cooloff/withdrawals?limit=5" -H "Authorization: Bearer $token")"
contains "admin list returns rows" "\"receipt_id\":\"$receipt\"" "$tmp/admin"
contains "admin list is JSON-encoded, not HTML" '"name":"<script>alert(1)</script>"' "$tmp/admin"
check "admin filter by order" "$(sql "select count(*) from cooloff_withdrawal where order_id='$order_id'")" "$(curl -s "$base/admin/cooloff/withdrawals?order_id=$order_id" -H "Authorization: Bearer $token" | grep -o '"receipt_id"' | wc -l | tr -d ' ')"
check "admin filter ignores junk" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$base/admin/cooloff/withdrawals?order_id=x%27%3Bdrop" -H "Authorization: Bearer $token")"
absent "no stack traces in server answers" '"stack"' "$tmp/out"

# The rate limit holds across requests (Medusa creates a new request scope each time).
codes=""
for n in 01 02 03 04 05 06 07 08 09 10 11 12 13; do codes="$codes $(post "$(body Rate 1 rate@example.eu "k_medusa_e2e_rate_$n")" -H "Origin: $origin" -H 'X-Forwarded-For: 198.51.100.77')"; done
check "rate limit per client across requests" " 201 201 201 201 201 201 201 201 201 201 201 201 429" "$codes"
check "another client is not limited" "201" "$(post "$(body Rate 1 rate@example.eu k_medusa_e2e_rate_other)" -H "Origin: $origin" -H 'X-Forwarded-For: 198.51.100.78')"
check "recipient limit holds back e-mails across requests" "5" "$(sql "select count(*) from notification where \"to\"='rate@example.eu'")"
absent "server log has no consumer e-mail in errors" 'error: jane@example.eu' "$tmp/server.log"

# Optional hook for manual checks (for example screenshots) while the server is up.
if [ -n "${COOLOFF_IT_AFTER:-}" ]; then
  COOLOFF_IT_BASE="$base" COOLOFF_IT_ORDER_ID="$order_id" sh -c "$COOLOFF_IT_AFTER"
fi

echo "Passed $pass, failed $fail"
[ "$fail" -eq 0 ]
