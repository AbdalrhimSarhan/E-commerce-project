# Phase 3: Authorization (guard level) and account management

## Summary

`@Public()`, `@Roles(...)`, `@CurrentUser()` (+ `@CurrentActor()` for auditing);
two global guards in order (`AuthenticatedGuard`, then `RolesGuard`, which is
**fail-closed**); a single denial hook that writes denied attempts to the audit
log; the development-only `AuthzDemoModule`; and super_admin account management
(design change C).

## Files

| File | Purpose |
| --- | --- |
| `src/modules/auth/decorators/auth.decorators.ts` | `Public`, `Roles`, `CurrentUser`, `CurrentActor` |
| `src/modules/auth/guards/authenticated.guard.ts` | non-public route without `req.user` → 401 |
| `src/modules/auth/guards/roles.guard.ts` | no `@Roles` → 403 + warning; role not listed → 403; `onDenied()` = the one denial hook (audit) |
| `src/modules/authz-demo/*` | demo routes, loaded only when `NODE_ENV=development` |
| `src/modules/users/users.controller.ts`, `users.service.ts`, `dto/list-users-query.dto.ts` | `GET /users`, `PATCH /users/:id/deactivate`, `PATCH /users/:id/activate` |
| `src/app.module.ts` | dev-only module loading |

## Role matrix

Status per route and identity. Write routes in the e2e test get an empty body:
authorization runs before validation, so **400/404 for a role means "allowed"**
(it reached the validator or the lookup), and 403 means "denied".

| Route | anonymous | user | admin | super_admin | agent |
| --- | --- | --- | --- | --- | --- |
| GET /api/health | 200 | 200 | 200 | 200 | 200 |
| GET /api/authz-demo/public | 200 | 200 | 200 | 200 | 200 |
| GET /api/authz-demo/any | 401 | 200 | 200 | 200 | 200 |
| POST /api/authz-demo/admin-only | 401 | 403 | 201 | 201 | 403 |
| POST /api/authz-demo/admin-agent | 401 | 403 | 201 | 201 | 201 |
| GET /api/authz-demo/no-roles (fail-closed) | 401 | 403 | 403 | 403 | 403 |
| GET /api/auth/me | 401 | 200 | 200 | 200 | 200 |
| POST /api/auth/logout, /logout-all | 401 | 200 | 200 | 200 | 403 |
| GET /api/users | 401 | 403 | 403 | 200 | 403 |
| PATCH /api/users/:id/deactivate, /activate | 401 | 403 | 403 | 200 (404 unknown id) | 403 |
| GET /api/audit-logs | 401 | 403 | 200 | 200 | 403 |
| GET /api/products, /products/:id | 401 | 200 | 200 | 200 | 200 |
| POST, PATCH, DELETE /api/products… | 401 | 403 | allowed | allowed | 403 |
| GET /api/categories, /categories/:id | 401 | 200 | 200 | 200 | 200 |
| POST, PATCH, DELETE /api/categories… | 401 | 403 | allowed | allowed | allowed |
| POST, PUT /api/categories/:id/products; DELETE …/products/:productId | 401 | 403 | allowed | allowed | allowed |

All 120 cells are tested in `test/authz.e2e-spec.ts`.

## Decisions not specified in the prompt

1. **`super_admin` is listed explicitly on every route an admin can use** (no
   hierarchy), and on the demo routes: `admin-only` = `super_admin, admin`;
   `admin-agent` = `super_admin, admin, agent`.
2. **`@CurrentActor()`** builds `{ principal, requestId, ipAddress }` so services
   can write audit rows inside their transactions; it is passed explicitly to the
   service methods instead of reading hidden global state.
3. **Denied attempts are recorded with metadata** (reason `no_roles_declared` /
   `role_not_allowed`, method, path, route, allowed roles). An audit failure is
   logged but never changes the 403.
4. **Anonymous 401s are not audited.**
5. **Deactivation:** row lock on the user; `is_active=false` + all open sessions
   revoked + audit row in one transaction. Already inactive → no change, no audit
   row. A super_admin → 403 (no self-lockout). Activation does not un-revoke sessions.
6. **No delete endpoint for users** (tested: `DELETE /api/users/:id` → 404).
7. **The e2e tests import `AuthzDemoModule` explicitly**, because they run with
   `NODE_ENV=test`, where it is not loaded.

## Verification

- `test/authz.e2e-spec.ts`: the matrix above, envelope + error code on every
  response, denied attempts in the audit log (including the fail-closed route),
  anonymous 401 not audited.
- `test/users.e2e-spec.ts`: pagination and filters, deactivation (tokens,
  refresh, login and agent key stop working; sessions revoked; audit row with
  `revokedSessions`), super_admin → 403, unknown id → 404, malformed id → 400,
  activation (old sessions stay revoked, a new login works, the agent key works
  again), no delete endpoint.
- Manual (development): start with `npm run start:dev` and call
  `/api/authz-demo/no-roles` with any token → 403, plus a log line
  `has no @Roles metadata: denied (fail-closed)`.

## My Review

