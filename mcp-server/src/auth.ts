/**
 * Key passthrough: the MCP client sends the agent's API key on every HTTP
 * request, and the MCP server forwards it to the API as X-API-Key. The API
 * decides who the caller is and what it may do; this server stores no secret.
 *
 * Accepted headers (MCP clients differ in what they can send):
 *   X-API-Key: <key>
 *   Authorization: Bearer <key>
 * X-API-Key wins when both are present.
 */
const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

export function extractApiKey(headers: Headers): string | null {
  const apiKey = headers.get('x-api-key')?.trim();
  if (apiKey) {
    return apiKey;
  }
  const match = BEARER_PATTERN.exec(headers.get('authorization')?.trim() ?? '');
  return match?.[1] ?? null;
}
