# Product Management API

REST API for products and categories (many-to-many) with authentication,
role-based authorization, an append-only audit log, and an **MCP server** that
lets AI agents use the system through the same API (see [MCP server](#mcp-server)).

Built with NestJS 12, TypeScript (strict), PostgreSQL 16, TypeORM 0.3 and Docker.

- **Docs:** Swagger UI at http://localhost:3000/api/docs (OpenAPI JSON: `/api/docs-json`)
- **Database design and ERD:** [docs/database.md](docs/database.md)
- **Design decisions:** [docs/design-decisions.md](docs/design-decisions.md)
- **MCP tools (schemas, examples, errors):** [docs/mcp-tools.md](docs/mcp-tools.md)
- **AI-assisted development report:** [docs/ai-development-report.md](docs/ai-development-report.md)
- **Phase reports:** [docs/reports/](docs/reports/)

## Run with Docker

Requirements: Docker with Compose v2.

```bash
cp .env.example .env
docker compose up -d --build
curl http://localhost:3000/api/health
```

On start the `api` container waits for a healthy Postgres, runs pending
migrations, seeds demo accounts and a demo catalog (`SEED_ON_STARTUP=true`), then starts. The `mcp`
container starts once the API is healthy. `docker compose ps` shows `db`, `api`
and `mcp` as `healthy`.

| Service | URL |
| --- | --- |
| REST API + Swagger | http://localhost:3000/api · http://localhost:3000/api/docs |
| MCP server | http://localhost:3001/mcp (health: http://localhost:3001/health) |

Postgres is published on host port **5433** (5432 is often taken by a local
Postgres / pgAdmin). Connect pgAdmin or psql to `localhost:5433`.

Stop with `docker compose down` (add `-v` to also delete the database volume).

### Demo accounts (local development only)

| Role | Login | Secret |
| --- | --- | --- |
| super_admin | superadmin@example.com | `SuperAdmin123` |
| admin | admin@example.com | `Admin12345` |
| user | user@example.com | `User12345` |
| agent | (no login) | header `X-API-Key: pmk_00000000_DEV-ONLY_local-agent-key_CHANGE-ME-outside0` |

> **Security:** every secret in `.env.example` (`JWT_SECRET`, seed passwords,
> `SEED_AGENT_API_KEY`) is public and for **local development only**. Change
> them in any other environment. Leave `SEED_AGENT_API_KEY` empty to get a
> random agent key printed once by the seed.

## Quick tour

```bash
# log in (returns accessToken + refreshToken)
curl -s -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"Admin12345"}'

# use the access token
curl -s localhost:3000/api/products -H "Authorization: Bearer <accessToken>"

# as the AI agent
curl -s localhost:3000/api/categories \
  -H 'X-API-Key: pmk_00000000_DEV-ONLY_local-agent-key_CHANGE-ME-outside0'
```

In Swagger UI, click **Authorize** and fill `bearer` (access token) or `apiKey`.

## Roles and permissions

There is no role hierarchy in code: every route lists its roles explicitly, and
a protected route without `@Roles` is **denied** (fail-closed).

| Area | Read | Write |
| --- | --- | --- |
| Products | super_admin, admin, user, agent | super_admin, admin |
| Categories (incl. product links) | super_admin, admin, user, agent | super_admin, admin, **agent** |
| Audit log | super_admin, admin | (nobody: append-only) |
| Users (list, activate, deactivate) | super_admin | super_admin |
| Own session (logout, logout-all) | | super_admin, admin, user |

- `user` is read-only. `agent` (AI) may manage categories and their product
  relationships, but not products. That is exactly what the MCP tools need.
- Users are **never deleted**; access is removed by deactivation, which also
  revokes all sessions. A super_admin cannot be deactivated.

## Authentication

| | Humans | AI agents |
| --- | --- | --- |
| Credential | email + password → **JWT access token** (15 min, HS256) + **refresh token** (7 days) | **API key** `pmk_<prefix>_<secret>` |
| Header | `Authorization: Bearer <token>` | `X-API-Key: <key>` |
| Stored | bcrypt password hash; sha256 of the refresh secret | sha256 of the key + its prefix |

- Every access token belongs to a server-side **session**: logout, logout-all
  and deactivation take effect immediately. The role is always read from the
  database, never trusted from the token.
- Refresh tokens are **rotated** on every use. Using an old one is treated as
  theft (**reuse detection**): the whole session is revoked.
- Sending both headers is rejected (401). Login, register and refresh are rate
  limited per IP (10 / minute by default).

Details and reasoning: [docs/design-decisions.md](docs/design-decisions.md).

## Endpoints

All under `/api`. Every response uses one envelope (see [API conventions](#api-conventions)).

| Method | Path | Roles |
| --- | --- | --- |
| GET | `/health` | public |
| POST | `/auth/register` | public (creates role `user`) |
| POST | `/auth/login` · `/auth/refresh` | public |
| POST | `/auth/logout` · `/auth/logout-all` | super_admin, admin, user |
| GET | `/auth/me` | all four roles |
| GET | `/products` (`page, limit, search, categoryId, isActive, sortBy, sortOrder`) · `/products/:id` | all four roles |
| POST · PATCH · DELETE | `/products` · `/products/:id` | super_admin, admin |
| GET | `/categories` (`page, limit, search`) · `/categories/:id` (with products) | all four roles |
| POST · PATCH · DELETE | `/categories` · `/categories/:id` | super_admin, admin, agent |
| POST · PUT | `/categories/:id/products` (add · replace, body `{ productIds }`) | super_admin, admin, agent |
| DELETE | `/categories/:id/products/:productId` | super_admin, admin, agent |
| GET | `/audit-logs` (`actorId, action, outcome, resourceType, resourceId, from, to`) | super_admin, admin |
| GET | `/users` (`role, isActive`) | super_admin |
| PATCH | `/users/:id/deactivate` · `/users/:id/activate` | super_admin |

`/authz-demo/*` (role-matrix demo routes) exist only when `NODE_ENV=development`.

## Run locally (API on the host)

Requirements: Node.js 24+.

```bash
cp .env.example .env
docker compose up -d db       # only the database
npm ci
npm run migration:run
npm run seed
npm run start:dev
```

## Tests

| Command | What |
| --- | --- |
| `npm test` | unit tests (97) |
| `npm run test:e2e` | e2e tests (213) over HTTP against a real database. Needs the db: `docker compose up -d db` |
| `docker compose --profile test run --rm e2e` | the e2e suite **inside Docker** (no Node needed on the host) |
| `docker compose --profile test run --rm e2e npm test` | the unit tests inside Docker |
| `cd mcp-server && npm test` | MCP server unit tests (46): error mapping, timeouts, key extraction, no key in logs |
| `docker compose --profile test run --rm mcp-e2e` | MCP e2e (14) with the real MCP client against the **running** stack (MCP → API → DB, nothing mocked) |

The e2e suite uses its **own database** (`product_management_test`, from
[.env.test](.env.test)), created automatically. Migrations run before the
suite (never `synchronize`), and tables are truncated between tests. Nothing in
the auth layer is mocked. It covers registration, login, tokens (expired,
tampered, `alg: none`), logout, refresh rotation and reuse detection
(including parallel refreshes), API keys, the full role matrix including the
fail-closed route, account management, products/categories/links, rollback on
failure, audit log content, rate limiting, and the response envelope.

Also: `npm run lint`, `npm run build`.

## Environment variables

All variables are validated at startup; if one is missing or invalid, the app
(and the migration CLI) exits and lists every problem.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | yes | | `development`, `production` or `test` |
| `PORT` | no | `3000` | HTTP port |
| `CORS_ORIGINS` | no | empty | Comma-separated allowed origins (`http(s)://` URLs). Empty disables CORS |
| `TRUST_PROXY` | no | `false` | Express `trust proxy` (`true`, `false`, hop count, or IPs/subnets/`loopback`/`uniquelocal`) so `req.ip` is right behind Docker/proxies |
| `DB_HOST` | yes | | Postgres host (`localhost` from the host; Compose sets `db` in the container) |
| `DB_PORT` | no | `5433` | Postgres port as seen from the host (the container always uses `db:5432`) |
| `DB_USERNAME` / `DB_PASSWORD` / `DB_NAME` | yes | | Also used by Compose to create the database |
| `DB_LOGGING` | no | `false` | Log every SQL query |
| `BCRYPT_ROUNDS` | no | `12` | bcrypt cost (10-15) |
| `JWT_SECRET` | yes | | HS256 key, at least 32 characters |
| `JWT_ISSUER` / `JWT_AUDIENCE` | no | `product-management-api` / `product-management-clients` | Set in and verified on every token |
| `JWT_ACCESS_TTL_SECONDS` | no | `900` | Access token lifetime |
| `REFRESH_TOKEN_TTL_SECONDS` | no | `604800` | Session lifetime (absolute, not extended by refresh) |
| `THROTTLE_AUTH_TTL_SECONDS` / `THROTTLE_AUTH_LIMIT` | no | `60` / `10` | Rate limit for register, login, refresh (per IP) |

Seed only (never read by the app):

| Variable | Required | Description |
| --- | --- | --- |
| `SEED_ON_STARTUP` | no (`false`) | `true`: the container seeds after migrations on every start (idempotent), including the demo catalog while the products table is empty. Other values stop the container |
| `SEED_SUPER_ADMIN_EMAIL` / `_PASSWORD` | yes | The single super_admin |
| `SEED_ADMIN_EMAIL` / `_PASSWORD`, `SEED_USER_EMAIL` / `_PASSWORD` | yes | Demo admin and user |
| `SEED_AGENT_EMAIL` | yes | Demo AI agent (no password) |
| `SEED_AGENT_API_KEY` | no | Fixed agent key (`pmk_<8 hex>_<43 base64url>`). Empty: a random key is generated and printed once |

Passwords: 8-72 characters with at least one letter and one digit. `.env` is git-ignored; never commit it.

## Database migrations

The schema changes **only** through migrations (`synchronize` is always
`false`). The CLI uses the same options as the app (`src/database/typeorm.config.ts`);
the scripts build first and run against `dist/`.

```bash
npm run migration:generate -- src/database/migrations/<Name>
npm run migration:create -- src/database/migrations/<Name>
npm run migration:run
npm run migration:revert
npm run migration:show
```

## Seed

`npm run seed` creates one super_admin, admin, user and agent (with an API key)
in one transaction. It is idempotent: existing accounts are left unchanged, and
contradictions (an email with another role, a second super_admin, a revoked
fixed key) make it fail without changing anything.

### Demo data

With `SEED_ON_STARTUP=true` (the default in `.env.example`) the seed also loads
a **demo catalog** of an electronics / home / office store, so the API and the
MCP tools have data to work with right away:

- **20 products** with SKUs, descriptions, prices and stock (one inactive,
  out-of-stock product), and **8 categories**.
- The many-to-many relationship is visible: several products are in 2 or 3
  categories (e.g. `MON-16-PORT` is in *Monitors & Displays*, *Home Office* and
  *Laptops & Computers*), **Clearance** has no products, and 3 products have no
  category (`NET-SW-8P`, `ACC-HUB-7IN1`, `ACC-STAND-AL`).
- It is created **only while the products table is empty**: once any product
  exists (seeded or created by you), the seed logs
  `skipped demo catalog (products already exist; nothing was changed)` and never
  touches the catalog again.
- It is validated with the API's own DTO rules (lengths, price format, SKU
  format) plus unique SKUs and case-insensitive unique category names, and it
  runs inside the seed's single transaction. A category that already exists
  with the same name is reused, not duplicated.
- Seeded data writes **no audit rows**: it is initial data, not an action by a
  user or an agent.

The data lives in [`src/database/seeds/demo-catalog.ts`](src/database/seeds/demo-catalog.ts).
To load it again from scratch: `docker compose down -v && docker compose up -d --build`
(this deletes the database volume).

## API conventions

```jsonc
// success
{ "success": true, "data": { }, "meta": { "requestId": "…", "timestamp": "…" } }
// paginated lists add to meta: "page", "limit", "total", "totalPages"

// error
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Validation failed",
             "details": [{ "field": "price", "message": "price must be a non-negative amount with at most 2 decimal places" }] },
  "meta": { "requestId": "…", "timestamp": "…", "path": "/api/products" }
}
```

| Code | HTTP | When |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Invalid input, malformed JSON, unknown related ids, DB check constraint |
| `BAD_REQUEST` | other 4xx | e.g. 405, 413, 415 |
| `UNAUTHORIZED` | 401 | Missing or invalid credentials |
| `FORBIDDEN` | 403 | Authenticated but not allowed |
| `NOT_FOUND` | 404 | Unknown route or resource |
| `CONFLICT` | 409 | Duplicate (email, SKU, category name) or related-resource conflict |
| `TOO_MANY_REQUESTS` | 429 | Rate limit hit |
| `INTERNAL_ERROR` | 500 | Unexpected error (details are only logged, with the request id) |
| `SERVICE_UNAVAILABLE` | 503 | Health check: the database is down |

- DELETE returns `200 { "id": "<uuid>" }`.
- Money is a decimal **string** (`"129.90"`), stored as `numeric(12,2)`.
- **Request id:** send `X-Request-Id` (`^[A-Za-z0-9-]{1,64}$`) or one is
  generated. It comes back in the header, in `meta.requestId`, in every log
  line (`[rid:…]`), and in every audit row.

## MCP server

[`mcp-server/`](mcp-server) exposes the system to AI agents as **10 MCP tools**
(TypeScript SDK v2, Streamable HTTP, stateless). It serves the 2026-07-28 MCP
revision and the 2025 revision on the same URL.

- **A pure API client:** it never touches the database and imports nothing from
  `src/`. Every tool is an HTTP call to the REST API, so authentication, roles,
  validation, business rules and the audit log all apply, and nothing can be bypassed.
- **No secret in the MCP server:** the client sends the agent API key
  (`X-API-Key` or `Authorization: Bearer`), and it is passed through to the
  API. No key → HTTP 401. The key is never logged.
- **Tools:** `list_products`, `get_product`, `list_categories`, `get_category`
  (read); `create_category`, `update_category`, `delete_category`,
  `add_products_to_category`, `replace_category_products`,
  `remove_product_from_category` (write). There are no product write tools,
  because the agent role may not change products (least privilege).
- Failed calls return `isError` with the API's `{ code, message, details, requestId }`.
  The `requestId` is also in the audit row of the change.

It starts with `docker compose up -d --build` (service `mcp`, port 3001).

**VS Code:** the committed [.vscode/mcp.json](.vscode/mcp.json) connects to
`http://localhost:3001/mcp` with the dev agent key. Command Palette → *MCP: List
Servers* → `product-management` → *Start*, then use the tools in Copilot agent mode.

**MCP Inspector:**
```bash
npx @modelcontextprotocol/inspector
```
Transport **Streamable HTTP**, URL `http://localhost:3001/mcp`, header
`X-API-Key: pmk_00000000_DEV-ONLY_local-agent-key_CHANGE-ME-outside0` → *Connect*
→ *Tools*.

Full tool reference (input schemas, examples, permissions, error codes):
[docs/mcp-tools.md](docs/mcp-tools.md).

## Project structure

```
src/
  main.ts                  bootstrap (logger, shutdown hooks, listen)
  app.setup.ts             HTTP setup shared with the e2e tests
  app.module.ts
  config/                  env validation
  database/                TypeORM options, CLI data source, migrations, seed
  common/                  request id, logger, envelope, errors, crypto, Swagger helpers
  modules/
    auth/                  login, sessions, tokens, middleware, guards, decorators
    users/                 users entity, account management
    products/  categories/ catalog (categories own the product links)
    audit/                 append-only audit log
    health/                /api/health
    authz-demo/            development-only role matrix demo
test/                      e2e suites + helpers (real DB over HTTP)
docker/entrypoint.sh       migrations, optional seed, then app start
mcp-server/                MCP server (own package, Dockerfile and tests)
  src/api-client.ts        the only way it talks to the system: HTTP to the API
  src/tools/               read tools, category write tools, result/error shaping
  src/http-app.ts          /mcp (key gate + createMcpHandler) and /health
  test/unit, test/e2e      node:test suites
http-requests/             REST Client files for manual API testing
```
