import { type Config, loadConfig } from './config.ts';
import { createHttpApp } from './http-app.ts';
import { log } from './logger.ts';

let config: Config;
try {
  config = loadConfig(process.env);
} catch (error) {
  // Fail fast with a clear message.
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const app = createHttpApp(config);

app.server.listen(config.MCP_PORT, '0.0.0.0', () => {
  log(`MCP server listening on port ${config.MCP_PORT} (POST /mcp, GET /health); API: ${config.API_BASE_URL}`);
});

// Graceful shutdown on `docker stop` / Ctrl+C.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    log(`${signal} received, shutting down`);
    void app.close().then(() => process.exit(0));
  });
}
