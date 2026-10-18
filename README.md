# Product Management API

REST API for products and categories with role-based access, an audit log, and
an MCP server that lets AI agents work through the same API.

Built with NestJS 12, TypeScript (strict), PostgreSQL 16, TypeORM 0.3 and Docker.

> Status: **Phase 0 (foundation)**: config, database wiring, health check,
> unified responses, Swagger, Docker. Auth, products/categories, audit log and
> MCP follow in later phases.

## Run with Docker

Requirements: Docker with Compose v2.

```bash
cp .env.example .env
docker compose up -d --build
curl http://localhost:3000/api/health
```

- API: http://localhost:3000/api
- Swagger UI: http://localhost:3000/api/docs (OpenAPI JSON at `/api/docs-json`)

The `api` container waits until Postgres is healthy, runs pending migrations,
then starts. `docker compose ps` shows both services as `healthy`.

Stop with `docker compose down` (add `-v` to also delete the database volume).

## Run locally (without Docker for the API)

Requirements: Node.js 24+.

```bash
cp .env.example .env          # DB_HOST=localhost
docker compose up -d db       # only the database
npm ci
npm run migration:run
npm run start:dev
```

## Environment variables

All variables are validated at startup. If one is missing or invalid, the app
(and the migration CLI) exits and lists every problem.

| Variable       | Required | Default | Description |
| -------------- | -------- | ------- | ----------- |
| `NODE_ENV`     | yes      | none    | `development`, `production` or `test` |
| `PORT`         | no       | `3000`  | HTTP port |
| `CORS_ORIGINS` | no       | empty   | Comma-separated allowed origins (full `http(s)://` URLs). Empty disables CORS |
| `TRUST_PROXY`  | no       | `false` | Express `trust proxy`: `true`, `false`, a hop count, or comma-separated IPs/subnets/`loopback`/`linklocal`/`uniquelocal`. Needed for a correct `req.ip` behind Docker or a proxy |
| `DB_HOST`      | yes      | none    | Postgres host (`localhost` locally; Compose overrides it to `db` in the container) |
| `DB_PORT`      | no       | `5432`  | Postgres port. `.env.example` uses `5433`: Compose publishes the container's Postgres on that host port, so it doesn't clash with a locally installed Postgres. Inside the `api` container Compose forces `5432` |
| `DB_USERNAME`  | yes      | none    | Postgres user (also used by Compose to create the database) |
| `DB_PASSWORD`  | yes      | none    | Postgres password |
| `DB_NAME`      | yes      | none    | Database name |
| `DB_LOGGING`   | no       | `false` | Log every SQL query (`true` / `false`) |

`.env` is git-ignored. Never commit it.

## Database migrations

The schema is changed **only** through migrations (`synchronize` is always
`false`). The CLI uses the same DataSource options as the app
(`src/database/typeorm.config.ts`); scripts build first and run against `dist/`.

```bash
npm run migration:generate -- src/database/migrations/<Name>   # diff entities vs DB
npm run migration:create -- src/database/migrations/<Name>     # empty migration
npm run migration:run
npm run migration:revert
npm run migration:show
```

## Tests and quality

```bash
npm test          # unit tests
npm run lint
npm run build
```

## API conventions

All routes are under `/api`. Every response uses one envelope:

```jsonc
// success
{ "success": true, "data": { }, "meta": { "requestId": "…", "timestamp": "…" } }

// error
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Validation failed",
             "details": [{ "field": "email", "message": "email must be an email" }] },
  "meta": { "requestId": "…", "timestamp": "…", "path": "/api/…" }
}
```

Paginated lists add `page`, `limit`, `total`, `totalPages` to `meta`.

| Code                  | HTTP | When |
| --------------------- | ---- | ---- |
| `VALIDATION_ERROR`    | 400  | Invalid input, malformed JSON, DB check constraint |
| `BAD_REQUEST`         | other 4xx | e.g. 405, 413, 415 |
| `UNAUTHORIZED`        | 401  | Missing or invalid credentials |
| `FORBIDDEN`           | 403  | Authenticated but not allowed |
| `NOT_FOUND`           | 404  | Unknown route or resource |
| `CONFLICT`            | 409  | Unique or foreign-key conflict |
| `TOO_MANY_REQUESTS`   | 429  | Rate limit hit |
| `INTERNAL_ERROR`      | 500  | Unexpected error (details are only logged) |
| `SERVICE_UNAVAILABLE` | 503  | Health check: a dependency is down |

**Request id:** send `X-Request-Id` (`^[A-Za-z0-9-]{1,64}$`) to correlate
requests; otherwise a UUID is generated. It comes back in the `X-Request-Id`
header, in `meta.requestId`, and in every server log line (`[rid:…]`).

## Project structure

```
src/
  main.ts                 bootstrap (logger, shutdown hooks, listen)
  app.setup.ts            HTTP setup shared with e2e tests (prefix, pipes, helmet, CORS, Swagger)
  app.module.ts
  config/                 env validation
  database/               TypeORM options, CLI data source, migrations
  common/                 cross-cutting: request id, logger, envelope, errors, Swagger helpers
  modules/<feature>/      feature modules (health, then auth, products, categories, audit, mcp)
docker/entrypoint.sh      migrations, then app start
```
