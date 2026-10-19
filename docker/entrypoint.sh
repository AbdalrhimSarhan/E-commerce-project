#!/bin/sh
# Container start: apply pending migrations, optionally seed, then start the API.
set -e

echo "Running database migrations..."
node ./node_modules/typeorm/cli.js -d dist/database/data-source.js migration:run

# The seed is idempotent, so running it on every start is safe.
case "${SEED_ON_STARTUP:-false}" in
  true)
    echo "Seeding demo data (SEED_ON_STARTUP=true)..."
    node dist/database/seeds/seed.js
    ;;
  false)
    echo "Skipping seed (SEED_ON_STARTUP=false)"
    ;;
  *)
    echo "Invalid SEED_ON_STARTUP='${SEED_ON_STARTUP}': use true or false" >&2
    exit 1
    ;;
esac

echo "Starting API..."
# exec replaces the shell, so SIGTERM from `docker stop` reaches Node directly
# and Nest's shutdown hooks run (graceful shutdown).
exec node dist/main.js
