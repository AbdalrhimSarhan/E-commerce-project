import type { CallToolResult } from '@modelcontextprotocol/server';
import type { ApiMeta, ApiResult } from '../api-client.ts';
import { logToolCall } from '../logger.ts';

export interface ToolSuccess {
  /** One human-readable line, e.g. "Found 12 products (page 1 of 2)". */
  summary: string;
  /** Machine-readable result (structuredContent must be a JSON object). */
  structured: Record<string, unknown>;
}

/**
 * Runs one tool call: calls the API, logs one line, and shapes the result.
 * - success: a text summary + the JSON (as text for older clients, and as
 *   structuredContent)
 * - failure: isError + the API's { code, message, details?, requestId }, so
 *   the agent can see WHY the call failed
 */
export async function runTool<T>(
  tool: string,
  call: () => Promise<ApiResult<T>>,
  onSuccess: (data: T, meta: ApiMeta) => ToolSuccess,
): Promise<CallToolResult> {
  const startedAt = performance.now();
  const result = await call();
  const durationMs = Math.round(performance.now() - startedAt);

  if (!result.ok) {
    logToolCall({
      tool,
      requestId: result.error.requestId,
      outcome: 'error',
      errorCode: result.error.code,
      durationMs,
    });
    return {
      isError: true,
      content: [
        { type: 'text', text: `${result.error.code}: ${result.error.message}` },
        { type: 'text', text: JSON.stringify({ error: result.error }) },
      ],
      structuredContent: { error: result.error },
    };
  }

  logToolCall({ tool, requestId: result.requestId, outcome: 'ok', durationMs });
  const success = onSuccess(result.data, result.meta);
  const structured = { ...success.structured, requestId: result.requestId };
  return {
    content: [
      { type: 'text', text: success.summary },
      { type: 'text', text: JSON.stringify(structured) },
    ],
    structuredContent: structured,
  };
}

export function paginationOf(meta: ApiMeta): Record<string, number | undefined> {
  return {
    page: meta.page,
    limit: meta.limit,
    total: meta.total,
    totalPages: meta.totalPages,
  };
}
