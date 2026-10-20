import { createServer, type Server, type ServerResponse } from 'node:http';
import { localhostOriginValidation, toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, type McpHttpHandler } from '@modelcontextprotocol/server';
import { ApiClient } from './api-client.ts';
import { extractApiKey } from './auth.ts';
import type { Config } from './config.ts';
import { log, redact } from './logger.ts';
import { createMcpServer } from './mcp-server.ts';

export interface HttpApp {
  server: Server;
  close: () => Promise<void>;
}

const MISSING_KEY_BODY = JSON.stringify({
  error: {
    code: 'UNAUTHORIZED',
    message: 'Send the agent API key as "X-API-Key: <key>" or "Authorization: Bearer <key>".',
  },
});

/**
 * Routes:
 *   GET  /health  public; 200 when this server is up AND the API answers
 *   POST /mcp     the MCP endpoint (Streamable HTTP, stateless)
 */
export function createHttpApp(config: Config): HttpApp {
  /*
   * createMcpHandler (SDK v2) serves the 2026-07-28 revision and, with the
   * default `legacy: 'stateless'`, also 2025-era clients over the stateless
   * Streamable HTTP idiom. Each request gets a fresh McpServer from the
   * factory, bound to the key of THAT request (passed through as authInfo).
   */
  const mcpHandler: McpHttpHandler = createMcpHandler(
    (ctx) => {
      const apiKey = ctx.authInfo?.token;
      if (!apiKey) {
        // Unreachable: the gate below answers 401 before the handler runs.
        throw new Error('No API key for this request');
      }
      return createMcpServer(
        new ApiClient({ baseUrl: config.API_BASE_URL, apiKey, timeoutMs: config.API_TIMEOUT_MS }),
      );
    },
    {
      legacy: 'stateless',
      onerror: (error) => log(`mcp handler error: ${redact(error.message)}`),
    },
  );

  // Key gate: no key -> HTTP 401 before any MCP handling.
  const gatedMcp = toNodeHandler(
    {
      fetch: async (request: Request) => {
        const apiKey = extractApiKey(request.headers);
        if (!apiKey) {
          return new Response(MISSING_KEY_BODY, {
            status: 401,
            headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' },
          });
        }
        return mcpHandler.fetch(request, {
          authInfo: { token: apiKey, clientId: 'mcp-agent', scopes: [] },
        });
      },
    },
    { onerror: (error) => log(`mcp adapter error: ${redact(error.message)}`) },
  );

  // Browsers on other origins cannot drive this server (DNS rebinding protection).
  // Requests without an Origin header (VS Code, Inspector proxy, scripts) pass.
  const validateOrigin = localhostOriginValidation();

  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;

    if (path === '/health' && req.method === 'GET') {
      void health(config, res);
      return;
    }
    if (path === '/mcp') {
      if (!validateOrigin(req, res)) return;
      void gatedMcp(req, res);
      return;
    }
    sendJson(res, 404, { error: { code: 'NOT_FOUND', message: `Cannot ${req.method ?? 'GET'} ${path}` } });
  });

  return {
    server,
    close: async () => {
      await mcpHandler.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** 200 only when the API's own health endpoint answers 200 (so Docker waits for both). */
async function health(config: Config, res: ServerResponse): Promise<void> {
  let apiUp = false;
  try {
    const response = await fetch(`${config.API_BASE_URL}/health`, {
      signal: AbortSignal.timeout(Math.min(config.API_TIMEOUT_MS, 3000)),
    });
    apiUp = response.ok;
  } catch {
    apiUp = false;
  }
  sendJson(res, apiUp ? 200 : 503, { status: apiUp ? 'ok' : 'error', api: apiUp ? 'up' : 'down' });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
