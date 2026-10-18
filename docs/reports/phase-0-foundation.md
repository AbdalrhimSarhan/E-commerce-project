# Phase 0: Project Foundation

## Summary

The project skeleton every later phase builds on:

- NestJS 12 app with TypeScript strict mode and strict lint rules (no `any`).
- Validated configuration: the app and the migration CLI refuse to start on a
  missing or invalid variable and list every problem.
- PostgreSQL through TypeORM 0.3, with `synchronize: false` hard-coded and one
  shared options builder for the app and the CLI. Migration npm scripts are set up.
- `GET /api/health` (terminus + DB ping).
- Request id on every request (header, `meta`, log lines).
- Unified success/error envelope (interceptor + filter), including Express-level
  errors and routes outside `/api`.
- Global ValidationPipe (`whitelist`, `forbidNonWhitelisted`, `transform`) with
  `{ field, message }` details.
- helmet, CORS from env, `trust proxy` from env, graceful shutdown.
- Swagger at `/api/docs` with `bearer` + `apiKey` schemes and envelope schemas.
- Docker: multi-stage image (non-root), Compose with healthchecks; migrations run
  on container start.
- 43 unit tests.

## Folder structure

```
src/
  main.ts                     bootstrap: logger, setupApp, shutdown hooks, listen
  app.module.ts               ConfigModule, DatabaseModule, HealthModule
  app.setup.ts                HTTP setup shared with future e2e tests
  config/env.validation.ts    EnvironmentVariables + validateEnv + parseTrustProxy
  database/
    typeorm.config.ts         buildTypeOrmOptions(): the single source of DB options
    data-source.ts            DataSource for the TypeORM CLI
    database.module.ts        TypeOrmModule.forRootAsync (same builder)
    migrations/               (empty; first migration in Phase 1)
  common/
    constants/                error codes, request-id header + pattern
    context/                  AsyncLocalStorage request context
    envelope/                 envelope TypeScript types
    exceptions/               ValidationException + error flattening
    filters/                  exception mapper, send-error-envelope, global filter
    interceptors/             success envelope
    logger/                   AppLogger (adds [rid:...])
    middleware/               request id, api-prefix-only
    pagination/               PaginatedResult
    swagger/                  envelope DTOs, @ApiOkEnvelope / @ApiErrorEnvelopes, setup
    types/express.d.ts        Request.requestId
  modules/health/             controller, module, DTO
docker/entrypoint.sh          migrations, then exec node
```

Later feature modules go in `src/modules/<name>` (auth, users, products,
categories, audit, mcp).

## Dependencies added

| Package | Kind | Why |
| --- | --- | --- |
| `@nestjs/config` | prod | Loads env, `validate` hook so startup fails on bad config |
| `class-validator`, `class-transformer` | prod | DTO validation + env validation (same style, no Joi) |
| `typeorm` (0.3.31), `@nestjs/typeorm`, `pg` | prod | ORM, its official Nest integration, Postgres driver |
| `@nestjs/swagger` | prod | OpenAPI document + UI |
| `@nestjs/terminus` | prod | Health check with DB ping |
| `helmet` | prod | Security headers |
| `@types/pg` | dev | Types for the driver |

Upgraded: `@nestjs/*` 11 → 12, `typescript` 5.9 → 6.0 (see decision 1).
`npm audit --omit=dev`: 0 vulnerabilities. The remaining "moderate" findings are
in dev tooling only.

## Files changed

| File | Purpose |
| --- | --- |
| `tsconfig.json`, `tsconfig.build.json` | strict mode; Nest 12 template layout; no `.d.ts` in `dist` |
| `eslint.config.mjs` | `no-explicit-any`, `no-floating-promises`, `no-unsafe-argument` are errors |
| `package.json`, `package-lock.json` | deps, migration scripts, Jest with `--experimental-vm-modules` |
| `jest.config.ts` | unit test config (moved out of package.json, as in the Nest 12 template) |
| `.env.example` | every variable with a working local value |
| `.gitignore` | ignore `*.tsbuildinfo` |
| `.gitattributes` | keep `*.sh` LF |
| `.dockerignore` | small build context, never ship `.env` |
| `Dockerfile` | multi-stage, `node:24-bookworm-slim`, non-root `node` user |
| `docker/entrypoint.sh` | `migration:run`, then `exec node dist/main.js` |
| `docker-compose.yml` | `db` (postgres:16, volume, pg_isready) + `api` (waits for healthy db, healthcheck) |
| `README.md` | run with Docker (3 commands), env table, migrations, conventions |
| `src/main.ts` | bootstrap, AppLogger, shutdown hooks, exit 1 on failed start |
| `src/app.module.ts` | root module |
| `src/app.setup.ts` | request id, trust proxy, helmet, CORS, prefix, pipe, interceptor, filter, Swagger |
| `src/config/env.validation.ts` (+ spec) | env schema and validation |
| `src/database/*` | options builder, CLI data source, Nest module |
| `src/common/**` (+ specs) | cross-cutting pieces listed above |
| `src/modules/health/*` | `GET /api/health` |
| Deleted: `src/app.controller.ts`, `app.service.ts`, `app.controller.spec.ts`, `test/app.e2e-spec.ts` | Hello World scaffold |

## Decisions not specified in the prompt (and deviations)

1. **NestJS 12 + TypeScript 6.0.** "Current stable" is Nest 12 (released
   2026-08-27). Its packages are ESM-only and its tooling requires TypeScript ≥ 6.
   TS is pinned to `~6.0` because typescript-eslint supports `<6.1`. Following the
   **official Nest 12 project template**, the app itself stays CommonJS (Node 24
   loads the ESM packages through `require(esm)`), and Jest runs with
   `--experimental-vm-modules`. That flag prints an `ExperimentalWarning`, which is
   expected.
2. **TypeORM pinned to 0.3.31.** The latest is 1.x; the prompt requires 0.3.x.
3. **Two new error codes (deviation from the fixed set):**
   `SERVICE_UNAVAILABLE` (503), used by the health check when the DB is down, and
   `BAD_REQUEST` for any other 4xx without its own code (405, 413, 415, ...), with
   the original status kept.
4. **Request id middleware is registered with `app.use()`** as the very first
   Express middleware, not through Nest's `MiddlewareConsumer`. This guarantees it
   runs before helmet/CORS/body-parser and for unknown routes.
5. **Routes outside `/api` return the 404 envelope.** Nest 12 installs its
   not-found and error handling only under the global prefix, so `GET /foo` got
   Express's HTML page. `apiPrefixOnly` answers those requests with the envelope.
   The filter logic was extracted to `sendErrorEnvelope()` so both paths share it.
6. **The health 503 never exposes driver messages.** `error.details` contains only
   `{ field: 'database', message: 'down' }`. The raw terminus message was
   `getaddrinfo ENOTFOUND db`, which leaks infrastructure details on a public
   endpoint.
7. **Malformed JSON → 400 `VALIDATION_ERROR`** with the parser's message (it is
   safe: it describes the client's own input).
8. **helmet's `upgrade-insecure-requests` is disabled.** The API is served over
   plain HTTP; with that directive, browsers fetch the Swagger UI assets over
   HTTPS and `/api/docs` breaks when opened by IP or hostname.
9. **Two database files instead of one:** `typeorm.config.ts` (the builder, used by
   app and CLI) and `data-source.ts` (CLI entry point). The CLI file validates
   `process.env` at import time, which the app must not do before ConfigModule has
   loaded `.env`. There is still exactly one place that defines the options.
10. **Migration scripts build first and run the CLI against `dist/`**
    (`npm run build && typeorm -d dist/database/data-source.js ...`). There is no
    ts-node in the loop, and it is the same code path as in Docker.
    `migration:generate` still writes a `.ts` file into `src/database/migrations`.
    `--env-file-if-exists=.env` (built into Node) loads `.env`, so no dotenv.
11. **`tsconfig.build.json` sets `declaration: false`,** so `dist/database/migrations`
    never contains `.d.ts` files that the migrations glob would try to load.
12. **Host port 5433 for the Docker Postgres.** On this machine a PostgreSQL 18
    Windows service already listens on 5432, so the host-side CLI was talking to
    the wrong server. Compose publishes the container's 5432 on host `DB_PORT`
    (`5433` in `.env.example`), and the `api` container always uses `db:5432`.
13. **`NODE_ENV` is required** (no default), so production can never silently run
    as development. Compose sets `NODE_ENV=production` for the container.
14. **`node:24-bookworm-slim`** (Debian) instead of Alpine, so bcrypt's native module
    in Phase 1 needs no extra build tools.
15. **Entrypoint is started with `sh` and stripped of CRLF in the Dockerfile,** so a
    script saved on Windows works without an exec bit. `.gitattributes` keeps it LF
    in the repo.
16. **Decorated classes use `!:`** (definite assignment). With `strict` on,
    TypeScript cannot see that class-validator/Swagger populate them.
17. **DB connection retries at startup: 5 × 3 s,** then the process exits with code
    1 and Docker restarts it (`restart: unless-stopped`).
18. **`seed` npm script is deferred to Phase 1,** where the seed script is created.
19. **`.env.example` has no inline comments** (you removed them), so every variable
    is documented in the README table instead.
20. `test:e2e` has no tests yet (Phase 4), so it currently reports "No tests found".

No conflicts with `backend-task.md` were found for this phase.

## Verification

Run these from the project root (PowerShell or Git Bash):

| # | Command | Expected |
| --- | --- | --- |
| 1 | `npm ci` | installs with no peer-dependency errors |
| 2 | `npm run build` | no errors |
| 3 | `npm run lint` | no output (0 problems) |
| 4 | `npm test` | `Tests: 43 passed` (plus an expected ExperimentalWarning) |
| 5 | `docker compose up -d --build` then `docker compose ps` | `db` and `api` both `(healthy)` |
| 6 | `docker compose logs api` | `No migrations are pending`, then `API listening on port 3000` |
| 7 | `curl -i http://localhost:3000/api/health` | `200`, `X-Request-Id` header, `{"success":true,"data":{"status":"ok",...},"meta":{"requestId":...,"timestamp":...}}` |
| 8 | `curl -i -H "X-Request-Id: abc-123" http://localhost:3000/api/health` | header and `meta.requestId` are `abc-123` |
| 9 | `curl -i -H "X-Request-Id: bad id!" http://localhost:3000/api/health` | a new UUID instead |
| 10 | `curl -i http://localhost:3000/api/nope` and `curl -i http://localhost:3000/foo` | `404`, `"code":"NOT_FOUND"`, `meta.path` set |
| 11 | `curl -i -X POST -H "Content-Type: application/json" -d "{bad" http://localhost:3000/api/health` | `400`, `"code":"VALIDATION_ERROR"` |
| 12 | `docker compose stop db`, then the curl from row 7 | `503`, `"code":"SERVICE_UNAVAILABLE"`, `details: [{field:"database",message:"down"}]`; the api log shows `[rid:...] Health Check has failed!` |
| 13 | `docker compose start db`, wait a few seconds, curl again | `200` |
| 14 | open http://localhost:3000/api/docs → **Authorize** | `bearer` and `apiKey` schemes; `/api/health` shows the 200 envelope, 503 and 500 |
| 15 | `npm run migration:show` | builds, exits 0, lists no migrations |
| 16 | `docker compose exec db psql -U postgres -d product_management -c "\dt"` | only the `migrations` table |
| 17 | remove `DB_HOST` from `.env`, then `npm run build; node --env-file=.env dist/main.js` | exits with code 1: `Invalid environment configuration: - DB_HOST: ...` (put it back afterwards) |
| 18 | `docker compose stop api`, then `docker inspect -f "{{.State.ExitCode}}" e-commerce-project-api-1` | `0` (graceful shutdown) |

All 18 checks were run during implementation, with the results shown above.

## Suggested commit

You asked for one commit for this phase:

```
feat: project foundation (phase 0)

- NestJS 12 with TypeScript 6 strict mode and strict lint rules
- validated env config; app and migration CLI fail fast on bad config
- TypeORM 0.3 + PostgreSQL with synchronize disabled and migration scripts
- request id middleware, request-scoped logger, unified response envelope,
  global exception filter and validation pipe
- GET /api/health with database ping
- Swagger at /api/docs with bearer and api-key schemes
- multi-stage Dockerfile and docker compose with healthchecks
- README run instructions and phase 0 report
```

## My Review

