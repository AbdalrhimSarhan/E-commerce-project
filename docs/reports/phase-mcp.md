# Phase MCP: MCP server

## Summary

A new package, `mcp-server/`, exposes the system to AI agents as 10 MCP tools
over Streamable HTTP (stateless), built on the TypeScript SDK v2
(`@modelcontextprotocol/server` 2.3.1, `@modelcontextprotocol/node` 2.1.1, zod 4).
It is a **pure client of the REST API**: no database access, no imports from
`src/`, and no stored secret (the agent key is passed through on every
request). It runs as the `mcp` Compose service, healthy after the API, and VS
Code connects through the committed `.vscode/mcp.json`.

- **Protocol:** `createMcpHandler` with `legacy: 'stateless'` serves **2026-07-28**
  and the **2025** revision on `POST /mcp`. Both eras are verified in e2e
  (`getProtocolEra()` = `modern` / `legacy`), and MCP Inspector 2.11.0
  (`tools/list`, `tools/call`) was checked by hand.
- **Tests:** 46 unit tests (`npm test` in `mcp-server`) and 14 e2e tests with
  `@modelcontextprotocol/client` against the running stack, run from the host
  and with `docker compose --profile test run --rm mcp-e2e`. The 293 API tests
  still pass.

## How the SDK v2 docs were used

Before writing code: the migration guide `docs/migration/support-2026-07-28.md`
(GitHub), then the installed packages' READMEs and `.d.mts` type definitions
(`createMcpHandler`, `McpRequestContext.authInfo`, `registerTool`,
`toNodeHandler`, `StreamableHTTPClientTransport`). A small spike confirmed both
eras end to end before the real implementation. v2 installed and worked, so no
fallback to v1 was needed.

## Files

| File | Purpose |
| --- | --- |
| `mcp-server/package.json`, `package-lock.json` | own package (ESM), scripts `build`, `start`, `dev`, `typecheck`, `test`, `test:e2e` |
| `mcp-server/tsconfig.json`, `tsconfig.build.json` | strict, `noUncheckedIndexedAccess`, `erasableSyntaxOnly` (Node runs the `.ts` sources directly), no `any` |
| `mcp-server/src/config.ts` | `API_BASE_URL`, `MCP_PORT` (3001), `API_TIMEOUT_MS` (10000), validated with zod, fail fast |
| `mcp-server/src/auth.ts` | key from `X-API-Key` or `Authorization: Bearer` |
| `mcp-server/src/api-client.ts` | the typed HTTP client: key passthrough, timeout, `X-Request-Id` per call, envelope unwrap |
| `mcp-server/src/errors.ts` | API error envelope → tool error; `UPSTREAM_UNAVAILABLE` |
| `mcp-server/src/logger.ts` | one line per tool call, redaction filter |
| `mcp-server/src/tools/*.ts` | schemas, API types, result runner, 4 read tools, 6 category write tools |
| `mcp-server/src/mcp-server.ts` | `McpServer` factory (per request, bound to that caller's API client) |
| `mcp-server/src/http-app.ts` | `GET /health`, `POST /mcp` (key gate → `createMcpHandler` via `toNodeHandler`), Origin check |
| `mcp-server/src/main.ts` | start + graceful shutdown |
| `mcp-server/test/unit/*.test.ts` | error mapping, client (timeout, unreachable, headers, query), key extraction, config, no key in logs, HTTP 401/404/503 |
| `mcp-server/test/e2e/*.ts` | the 7 required scenarios + both eras + Bearer header |
| `mcp-server/Dockerfile`, `.dockerignore`, `.gitignore` | multi-stage (`runtime` non-root `node` user, `test` stage) |
| `docker-compose.yml` | services `mcp` and `mcp-e2e` (profile `test`) |
| `.vscode/mcp.json`, `.gitignore` | ready VS Code config, tracked via `!.vscode/mcp.json` |
| `.dockerignore`, `tsconfig.json` (root) | keep `mcp-server/` out of the API's build context and type-check |
| `docs/mcp-tools.md` | architecture, auth model, every tool (schema, example, permission), error codes, VS Code/Inspector |
| `docs/design-decisions.md` | section 7 (MCP), limitations renumbered to 8 |
| `README.md` | MCP section, service table, test commands, structure |

## Deviations from the prompt (and decisions it did not cover)

1. **Test runner: Node's built-in `node:test`** instead of Jest. No extra
   dependencies, it runs the TypeScript sources directly (Node 24 type
   stripping), and it is fast. The commands are as requested (`npm test`, and the
   compose profile for e2e).
2. **`create_category` also accepts an optional `productIds`**, because the
   API's `CreateCategoryDto` has it. You listed `(name, description)`; I
   included it because it is a real field ("match the DTOs exactly").
3. **`update_category` requires at least one of `name`/`description`.** The API
   would accept an empty change as a no-op; refusing it gives the agent a clear
   error instead of a silent nothing.
4. **No `outputSchema` on the tools**; results still have `structuredContent`.
   Error results share that field (`{ error }`), and an output schema would
   force every result into a union shape. The schemas are documented in
   `docs/mcp-tools.md` instead.
5. **Origin validation** (`localhostOriginValidation`) on `/mcp`: browsers on
   other origins cannot drive the server (DNS rebinding). Clients that send no
   `Origin` (VS Code, Inspector, scripts, other containers) are unaffected.
   There is no Host-header allow-list, because the server must answer as `mcp:3001`
   inside Compose.
6. **`GET /health` checks the API** (`/api/health`) with a ≤3 s timeout: 200 only
   if both are up, otherwise 503. So Compose reports `mcp` healthy only when it
   can really serve.
7. **2026-07-28 client pinning:** in the e2e tests the client uses
   `versionNegotiation: { mode: 'auto' }` and asserts `modern`. A quick try with
   the `{ pin: '2026-07-28' }` option still reported `legacy` from
   `getProtocolEra()`. I did not dig further (it is a client-option detail, and
   `auto` proves the server serves 2026-07-28).
8. **The MCP e2e suite runs against the running dev stack.** It creates and
   deletes its own data (unique names), and test 7 deactivates the seeded agent
   and **reactivates it in a `finally`**. It logs in twice per run, well under
   the 10/minute login rate limit.
9. **Git:** you are still on `main`. The plan was an `mcp` branch; create it
   before committing if you still want it (see the final message).

## Verification

| # | Command | Expected |
| --- | --- | --- |
| 1 | `cp .env.example .env && docker compose up -d --build` | `docker compose ps`: db, api, mcp all `(healthy)` |
| 2 | `curl http://localhost:3001/health` | `{"status":"ok","api":"up"}` |
| 3 | `curl -i -X POST http://localhost:3001/mcp -H "Content-Type: application/json" -d "{}"` | `HTTP/1.1 401`, `{"error":{"code":"UNAUTHORIZED",...}}` |
| 4 | `cd mcp-server && npm ci && npm test` | `tests 46, pass 46` |
| 5 | `cd mcp-server && npm run typecheck` | no output |
| 6 | `docker compose --profile test run --rm mcp-e2e` | `tests 14, pass 14` |
| 7 | `npx @modelcontextprotocol/inspector --cli http://localhost:3001/mcp --transport http --header "X-API-Key: pmk_00000000_DEV-ONLY_local-agent-key_CHANGE-ME-outside0" --method tools/list` | the 10 tool names |
| 8 | VS Code: *MCP: List Servers* → `product-management` → *Start* | 10 tools available in agent mode |
| 9 | `docker compose logs mcp` | one line per tool call; `pmk_` never appears |
| 10 | `npm test` and `npm run test:e2e` (root) | 87 and 206 passing (API unchanged) |

## Suggested commits

1. `feat(mcp): add MCP server with API client and read tools`
2. `feat(mcp): add category write tools with error mapping`
3. `chore(docker): run MCP server in compose with ready VS Code config`
4. `test(mcp)+docs: add MCP tests, tool documentation and decisions`

## My Review

