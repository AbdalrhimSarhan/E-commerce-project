import * as z from 'zod';

/**
 * The MCP server's whole configuration. There is deliberately NO secret here:
 * the agent's API key comes from the MCP client on every request.
 */
const ConfigSchema = z.object({
  /** Base URL of the REST API, including the /api prefix. */
  API_BASE_URL: z
    .url({ protocol: /^https?$/, error: 'API_BASE_URL must be an http(s) URL, e.g. http://api:3000/api' })
    .transform((url) => url.replace(/\/+$/, '')),
  MCP_PORT: z.coerce
    .number({ error: 'MCP_PORT must be a number' })
    .int()
    .min(1)
    .max(65_535)
    .default(3001),
  /** Per-call timeout for requests to the API. */
  API_TIMEOUT_MS: z.coerce
    .number({ error: 'API_TIMEOUT_MS must be a number' })
    .int()
    .min(100)
    .max(120_000)
    .default(10_000),
});

export type Config = z.infer<typeof ConfigSchema>;

/** Validates the environment; throws one error listing every problem (fail fast). */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new Error(`Invalid MCP server configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}
