# Manual API requests (REST Client)

Ready-to-run requests for every route, for the VS Code extension
[REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client)
(`humao.rest-client`; VS Code suggests it via `.vscode/extensions.json`).

1. Start the API: `docker compose up -d --build` (http://localhost:3000).
2. Open a `.http` file and click **Send Request** above a request
   (or `Ctrl+Alt+R`). Run each file from top to bottom: the first request logs
   in, and later requests reuse its token automatically
   (`{{login.response.body.$.data.accessToken}}`).

| File | What |
| --- | --- |
| `00-health-and-conventions.http` | health, request id, 404/400 envelopes, OpenAPI |
| `01-auth.http` | login, me (JWT and API key), refresh rotation + reuse detection, logout, logout-all, register, every 401 case, rate limit |
| `02-products.http` | product CRUD, filters, pagination, permissions, validation errors |
| `03-categories-agent.http` | category CRUD and product links **as the AI agent** (what MCP will do) |
| `04-users-super-admin.http` | list users, deactivate/activate, the super_admin rules |
| `05-audit-logs.http` | the audit trail with every filter (super_admin only; admin and agent get 403) |
| `06-authz-demo-dev-only.http` | role matrix demo routes (needs `npm run start:dev` on port 3001) |

The accounts and the agent key are the local demo values from `.env.example`.
Unique values (emails, SKUs, names) use `{{$timestamp}}`, so every file can be
run again and again.
