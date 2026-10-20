import { randomUUID } from 'node:crypto';
import { mapApiError, type ToolError, upstreamUnavailable } from './errors.ts';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type QueryValue = string | number | boolean | undefined;

export interface ApiRequest {
  method: HttpMethod;
  /** Path below API_BASE_URL, e.g. `/categories/123/products`. */
  path: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
}

/** `meta` of the API's success envelope (pagination fields only on lists). */
export interface ApiMeta {
  requestId: string;
  timestamp: string;
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
}

export type ApiResult<T> =
  | { ok: true; data: T; meta: ApiMeta; requestId: string }
  | { ok: false; error: ToolError };

export interface ApiClientOptions {
  baseUrl: string;
  /** The agent's API key, forwarded as X-API-Key. Never logged. */
  apiKey: string;
  timeoutMs: number;
  /** Injectable for unit tests. */
  fetch?: typeof fetch;
}

/**
 * The only way the MCP server talks to the system: plain HTTP to the REST
 * API. The API authenticates the key, checks the role, validates the input,
 * applies the business rules and writes the audit log. Nothing here can
 * bypass that.
 */
export class ApiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs;
    this.fetchImpl = options.fetch ?? fetch;
  }

  /**
   * Sends one request with a fresh X-Request-Id. The API uses that id in its
   * logs and in the audit row, so a tool call can be traced end to end.
   */
  async request<T>(request: ApiRequest): Promise<ApiResult<T>> {
    const requestId = randomUUID();
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-API-Key': this.apiKey,
      'X-Request-Id': requestId,
    };
    if (request.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    let response: Response;
    try {
      response = await this.fetchImpl(this.buildUrl(request), {
        method: request.method,
        headers,
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      return { ok: false, error: upstreamUnavailable(requestId, timedOut) };
    }

    const body = await readJson(response);

    if (!response.ok) {
      return { ok: false, error: mapApiError(response.status, body, requestId) };
    }
    if (!isSuccessEnvelope(body)) {
      return {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'The API returned an unexpected response',
          requestId,
        },
      };
    }
    return { ok: true, data: body.data as T, meta: body.meta, requestId: body.meta.requestId };
  }

  private buildUrl(request: ApiRequest): string {
    const url = new URL(`${this.baseUrl}${request.path}`);
    for (const [key, value] of Object.entries(request.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

interface SuccessEnvelope {
  success: true;
  data: unknown;
  meta: ApiMeta;
}

function isSuccessEnvelope(body: unknown): body is SuccessEnvelope {
  if (typeof body !== 'object' || body === null) return false;
  const candidate = body as Record<string, unknown>;
  const meta = candidate.meta as Record<string, unknown> | undefined;
  return candidate.success === true && 'data' in candidate && typeof meta?.requestId === 'string';
}
