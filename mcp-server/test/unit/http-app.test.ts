import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createHttpApp, type HttpApp } from '../../src/http-app.ts';

/** The HTTP layer alone, with the API pointing at a closed port (unreachable). */
describe('HTTP app', () => {
  let app: HttpApp;
  let base: string;

  before(async () => {
    app = createHttpApp({ API_BASE_URL: 'http://127.0.0.1:9/api', MCP_PORT: 0, API_TIMEOUT_MS: 500 });
    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await app.close();
  });

  const initialize = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } },
  };

  it('answers POST /mcp without a key with HTTP 401 before any MCP handling', async () => {
    const response = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify(initialize),
    });

    assert.equal(response.status, 401);
    assert.equal(response.headers.get('www-authenticate'), 'Bearer');
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });

  it('accepts a key in either header and reaches the MCP handler', async () => {
    for (const headers of [{ 'X-API-Key': 'pmk_x' }, { Authorization: 'Bearer pmk_x' }]) {
      const response = await fetch(`${base}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
        body: JSON.stringify(initialize),
      });
      assert.equal(response.status, 200);
      await response.body?.cancel();
    }
  });

  it('reports 503 on /health when the API is unreachable', async () => {
    const response = await fetch(`${base}/health`);

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: 'error', api: 'down' });
  });

  it('answers unknown paths with 404', async () => {
    assert.equal((await fetch(`${base}/nope`)).status, 404);
  });
});
