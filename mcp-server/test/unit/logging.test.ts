import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ApiClient } from '../../src/api-client.ts';
import { log, redact, setLogSink } from '../../src/logger.ts';
import { runTool } from '../../src/tools/tool-runner.ts';

const KEY = 'pmk_0a1b2c3d_THISISTHESECRETPARTOFTHEKEY0123456789abcd';

describe('logging never contains the API key', () => {
  let lines: string[];

  beforeEach(() => {
    lines = [];
    setLogSink((line) => lines.push(line));
  });

  afterEach(() => {
    setLogSink((line) => process.stdout.write(`${line}\n`));
  });

  const clientAnswering = (response: () => Promise<Response>) =>
    new ApiClient({ baseUrl: 'http://api.test/api', apiKey: KEY, timeoutMs: 200, fetch: response });

  it('logs one line per successful tool call with name, requestId, outcome and duration', async () => {
    const api = clientAnswering(async () =>
      Response.json({ success: true, data: [], meta: { requestId: 'rid-ok', timestamp: 't' } }),
    );

    await runTool('list_categories', () => api.request({ method: 'GET', path: '/categories' }), () => ({
      summary: 's',
      structured: {},
    }));

    assert.equal(lines.length, 1);
    assert.match(lines[0] ?? '', /tool=list_categories requestId=rid-ok outcome=ok durationMs=\d+/);
    assert.doesNotMatch(lines.join('\n'), /THISISTHESECRET|pmk_/);
  });

  it('logs failures with the error code and still no key, and the tool result has no key either', async () => {
    const api = clientAnswering(async () => {
      throw new Error(`connect failed while sending X-API-Key: ${KEY}`);
    });

    const result = await runTool('get_product', () => api.request({ method: 'GET', path: '/products/x' }), () => ({
      summary: 's',
      structured: {},
    }));

    assert.equal(result.isError, true);
    assert.match(lines[0] ?? '', /tool=get_product .* outcome=error code=UPSTREAM_UNAVAILABLE/);
    assert.doesNotMatch(lines.join('\n'), /THISISTHESECRET|pmk_/);
    assert.doesNotMatch(JSON.stringify(result), /THISISTHESECRET|pmk_/);
  });

  it('redacts keys and bearer tokens even if one ever reaches a log message', () => {
    log(`oops ${KEY} and Authorization: Bearer abc.def.ghi`);

    assert.doesNotMatch(lines[0] ?? '', /THISISTHESECRET|abc\.def\.ghi/);
    assert.match(lines[0] ?? '', /\[REDACTED\].*\[REDACTED\]/);
  });

  it('redact() leaves normal text alone', () => {
    assert.equal(redact('tool=list_products requestId=1 outcome=ok'), 'tool=list_products requestId=1 outcome=ok');
  });
});
