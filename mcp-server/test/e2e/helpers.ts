import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

/*
 * E2E helpers. Everything runs against the real stack:
 *   MCP client -> MCP server -> REST API -> PostgreSQL
 * Defaults match the local dev setup (.env.example); in Docker the compose
 * service sets MCP_URL / API_URL to the service names.
 */
export const MCP_URL = process.env.MCP_URL ?? 'http://localhost:3001/mcp';
export const API_URL = process.env.API_URL ?? 'http://localhost:3000/api';
export const AGENT_KEY = process.env.AGENT_API_KEY ?? 'pmk_00000000_DEV-ONLY_local-agent-key_CHANGE-ME-outside0';
const ADMIN = {
  email: process.env.ADMIN_EMAIL ?? 'admin@example.com',
  password: process.env.ADMIN_PASSWORD ?? 'Admin12345',
};
const SUPER_ADMIN = {
  email: process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@example.com',
  password: process.env.SUPER_ADMIN_PASSWORD ?? 'SuperAdmin123',
};

export type Era = 'legacy' | 'modern';

/** Connects an MCP client sending `headers` (the key) on every HTTP request. */
export async function connect(headers: Record<string, string>, era: Era = 'legacy'): Promise<Client> {
  const client = new Client(
    { name: 'mcp-e2e', version: '1.0.0' },
    era === 'modern' ? { versionNegotiation: { mode: 'auto' } } : undefined,
  );
  await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL), { requestInit: { headers } }));
  return client;
}

export interface ToolOutcome {
  isError: boolean;
  structured: Record<string, unknown>;
  text: string;
}

export async function call(client: Client, name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
  const result = await client.callTool({ name, arguments: args });
  const first = result.content?.[0];
  return {
    isError: result.isError === true,
    structured: (result.structuredContent ?? {}) as Record<string, unknown>,
    text: first?.type === 'text' ? first.text : '',
  };
}

/** The `error` object of a failed tool call. */
export function errorOf(outcome: ToolOutcome): { code: string; message: string; requestId: string; details?: unknown } {
  return outcome.structured.error as { code: string; message: string; requestId: string; details?: unknown };
}

interface ApiOptions {
  method?: string;
  token?: string;
  body?: unknown;
}

/** Direct REST call (setup and verification only, never instead of a tool). */
export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<{ status: number; data: T }> {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token && { Authorization: `Bearer ${options.token}` }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const json = (await response.json()) as { data: T };
  return { status: response.status, data: json.data };
}

async function login(account: { email: string; password: string }): Promise<string> {
  const { status, data } = await api<{ accessToken: string }>('/auth/login', { method: 'POST', body: account });
  if (status !== 200) {
    throw new Error(`login as ${account.email} failed with HTTP ${status}`);
  }
  return data.accessToken;
}

export const loginAdmin = () => login(ADMIN);
export const loginSuperAdmin = () => login(SUPER_ADMIN);

/** Unique suffix so the suite can run repeatedly against the same database. */
export const unique = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
