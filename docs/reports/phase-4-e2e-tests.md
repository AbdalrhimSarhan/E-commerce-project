# Phase 4: E2E tests

## Summary

206 e2e tests over HTTP against a real PostgreSQL test database. Nothing in the
auth layer is mocked. They run from the host (`npm run test:e2e`) or fully in
Docker (`docker compose --profile test run --rm e2e`). There are also 87 unit
tests (`npm test`).

## Setup

| Piece | How |
| --- | --- |
| Test database | `product_management_test` from `.env.test` (committed, test-only values), on the same Postgres container. `test/utils/global-setup.ts` creates it if missing |
| Schema | `globalSetup` runs the migrations before the suite (never `synchronize`) |
| Isolation | `resetDatabase()` truncates all tables (except `migrations`) between tests; suites run `--runInBand` |
| App | `createTestApp()` = the real `AppModule` + `setupApp()` (same as `main.ts`) + `AuthzDemoModule` |
| Env | `node --env-file=.env.test`; `ConfigModule` ignores `.env` when `NODE_ENV=test`, so dev settings never leak into tests |
| Fixtures | users and API keys inserted directly (bcrypt cost 4 for speed); tokens are obtained through the real `/api/auth/login` |
| Docker | Dockerfile stage `test`; compose service `e2e` (profile `test`) with `DB_HOST=db` |

## Suites

| File | Tests | Covers |
| --- | --- | --- |
| `auth.e2e-spec.ts` | 35 | everything listed under Phase 4 for auth, plus alg none / other issuer / other secret, role from DB, parallel refresh, `last_used_at` throttling, audit of register/login/logout |
| `authz.e2e-spec.ts` | 122 | the full role matrix (24 routes × 5 identities, including fail-closed) + denial auditing |
| `users.e2e-spec.ts` | 11 | account management (design change C) |
| `catalog.e2e-spec.ts` | 27 | products, categories, links, agent permissions, validation, cascades, rollback, audit content, append-only trigger, concurrent link replaces |
| `http-conventions.e2e-spec.ts` | 9 | envelope, `X-Request-Id` echo/replace, 404 inside and outside `/api`, malformed JSON, middleware errors, helmet, OpenAPI security schemes |
| `rate-limit.e2e-spec.ts` | 2 | 429 envelope on the 4th login; other routes not limited |

**Mutation check (to prove the tests catch bugs):** I temporarily (a) allowed
agents to `POST /products` and (b) removed the revoke in reuse detection. The
suite failed exactly those 2 tests; after restoring the code, 206/206 pass.

## Decisions not specified in the prompt

1. **One shared Postgres container, separate test database** (no second
   container): simpler, and the DB name keeps data apart.
2. **`.env.test` is committed:** it holds only test values, and the test setup
   refuses to run unless `NODE_ENV=test`.
3. **Write routes in the role matrix use an empty body** (allowed → 400,
   denied → 403), so authorization is tested without creating data.
4. **The rate-limit suite sets a low limit** through a first import
   (`test/utils/low-rate-limit.ts`). Jest gives every file its own module
   registry, so other suites keep the high test limit.
5. Added a `test:e2e:ci` script (no `--env-file`) for the container, where
   Compose provides the env.

## Verification

```bash
docker compose up -d db
npm run test:e2e                                     # Tests: 206 passed
npm test                                             # Tests: 87 passed
docker compose --profile test run --rm e2e           # same 206, inside Docker
docker compose --profile test run --rm e2e npm test  # same 87, inside Docker
```

## My Review

