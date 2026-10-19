# Phase 2: Authentication (middleware level)

## Summary

Register, login, refresh (rotation + reuse detection), logout, logout-all and
`me`; JWT access tokens backed by server-side sessions; API keys for agents;
an `AuthenticationMiddleware` that only identifies the caller; and rate limits
on register/login/refresh. Built in the same run as Phase 3 (you asked to build
everything up to MCP at once), so the guards came directly instead of the
temporary `requirePrincipal` helper from the plan.

## Files

| File | Purpose |
| --- | --- |
| `src/modules/auth/auth.module.ts` | JwtModule, ThrottlerModule, global guards, middleware on all routes |
| `src/modules/auth/auth.controller.ts` | the 6 endpoints, Swagger, `@UseGuards(ThrottlerGuard)` on register/login/refresh |
| `src/modules/auth/auth.service.ts` | register, login (timing-safe), refresh (locked, rotating, reuse detection), logout(-all), me |
| `src/modules/auth/services/token.service.ts` | sign/verify HS256 JWT (algorithm, iss, aud pinned) |
| `src/modules/auth/services/principal-resolver.service.ts` | JWT → session + user; API key → key + user; generic 401 |
| `src/modules/auth/middleware/authentication.middleware.ts` | "who are you?" only |
| `src/modules/auth/refresh-token.ts` (+ spec) | `<sessionId>.<secret>` issue/parse |
| `src/modules/auth/types/auth-principal.ts`, `src/common/types/express.d.ts` | typed `req.user` |
| `src/modules/auth/dto/*.ts` | Register/Login/Refresh/Tokens/Me DTOs |
| `src/modules/users/dto/user-response.dto.ts` | public user shape (no password hash) |
| `src/config/env.validation.ts` | `JWT_*`, `REFRESH_TOKEN_TTL_SECONDS`, `THROTTLE_AUTH_*` |

Dependencies: `@nestjs/jwt` 12.0.3 (JWT signing/verification), `@nestjs/throttler`
6.7.1 (rate limiting). Both support Nest 12; prod audit: 0 vulnerabilities.

## Decisions not specified in the prompt

1. **TTLs in seconds** (`JWT_ACCESS_TTL_SECONDS=900`, `REFRESH_TOKEN_TTL_SECONDS=604800`)
   instead of strings like `15m`: unambiguous validation, and
   `accessTokenExpiresIn` is in seconds, like OAuth's `expires_in`.
2. **Register returns 201 with the user, not tokens**; the client logs in next.
3. **A duplicate email is caught by the unique constraint** (→ 409), not by a
   pre-check, so two parallel registrations can't both pass.
4. **Session expiry is absolute** (not extended by refresh).
5. **A reuse-detected revoke is committed before the 401 is thrown** (the
   transaction returns an outcome, and the error is thrown after the commit).
6. **The dummy bcrypt hash is created at startup** with the same `BCRYPT_ROUNDS`.
7. **Both headers present:** 401 with a specific message ("Send either…"). All
   *invalid* credentials use one generic message, and the real reason is logged
   at debug level only.
8. **An `Authorization` header that is not `Bearer`, or an empty `X-API-Key`:**
   treated as invalid credentials (401), not as anonymous.
9. **`/auth/logout` for an API-key principal** is impossible by roles (403); the
   service also refuses it explicitly, because TypeORM ignores `undefined` in a
   `where` and would otherwise revoke all sessions.
10. **Login and logout are audited** (also register and refresh-token reuse).
11. **The rate limiter is keyed by `req.ip`** (correct thanks to `TRUST_PROXY`)
    and uses in-memory storage (single instance).

## Verification

`npm run test:e2e`: `test/auth.e2e-spec.ts` (35 tests) covers every Phase 4
auth case: register (success, duplicate 409, `role` 400, weak password 400),
login (success + the four 401 cases with the same message), `me`, role taken from
the DB, deactivation effective immediately, expired / tampered / other-secret /
other-issuer / `alg: none` tokens, logout, logout-all (only that user's
sessions), rotation + reuse detection, **parallel refresh → exactly one
success**, API keys (valid, revoked, expired, garbage, inactive, non-agent,
empty, `last_used_at` throttled), both headers.
`test/rate-limit.e2e-spec.ts`: the 4th login in the window → 429 envelope.

Manual:
```bash
curl -s -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@example.com","password":"Admin12345"}'
curl -s localhost:3000/api/auth/me -H 'X-API-Key: pmk_00000000_DEV-ONLY_local-agent-key_CHANGE-ME-outside0'
```

## Suggested commits

See the combined list in [phase-5-catalog-and-audit.md](phase-5-catalog-and-audit.md#suggested-commits).

## My Review

