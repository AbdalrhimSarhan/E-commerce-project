#!/bin/sh
# Container start: apply pending migrations, then start the API.
set -e

echo "Running database migrations..."
node ./node_modules/typeorm/cli.js -d dist/database/data-source.js migration:run

echo "Starting API..."
# exec replaces the shell, so SIGTERM from `docker stop` reaches Node directly
# and Nest's shutdown hooks run (graceful shutdown).
exec node dist/main.js
