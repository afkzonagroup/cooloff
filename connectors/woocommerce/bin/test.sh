#!/bin/sh
# Runs PHPUnit and PHPCS (WordPress Coding Standards) in Docker.
# Needs Docker and `npm ci && npm run build` in the repository root.
set -eu
here="$(cd "$(dirname "$0")/.." && pwd)"
root="$(cd "$here/../.." && pwd)"
uid="$(id -u):$(id -g)"

"$here/bin/build.sh"

docker run --rm -u "$uid" -e COMPOSER_HOME=/tmp/composer -v "$here":/app -w /app composer:2 \
  install --no-interaction --no-progress --ignore-platform-req=ext-intl
docker run --rm -u "$uid" -v "$root":/repo -w /repo/connectors/woocommerce php:8.3-cli vendor/bin/phpunit
docker run --rm -u "$uid" -v "$root":/repo -w /repo/connectors/woocommerce php:8.3-cli vendor/bin/phpcs
