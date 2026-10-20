import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractApiKey } from '../../src/auth.ts';
import { loadConfig } from '../../src/config.ts';

describe('extractApiKey', () => {
  it('reads X-API-Key', () => {
    assert.equal(extractApiKey(new Headers({ 'X-API-Key': 'pmk_a' })), 'pmk_a');
  });

  it('reads Authorization: Bearer (any case, extra spaces)', () => {
    assert.equal(extractApiKey(new Headers({ Authorization: 'Bearer pmk_b' })), 'pmk_b');
    assert.equal(extractApiKey(new Headers({ Authorization: 'bearer   pmk_c ' })), 'pmk_c');
  });

  it('prefers X-API-Key when both are sent', () => {
    assert.equal(
      extractApiKey(new Headers({ 'X-API-Key': 'pmk_header', Authorization: 'Bearer pmk_bearer' })),
      'pmk_header',
    );
  });

  it('returns null when there is no usable key', () => {
    assert.equal(extractApiKey(new Headers()), null);
    assert.equal(extractApiKey(new Headers({ 'X-API-Key': '   ' })), null);
    assert.equal(extractApiKey(new Headers({ Authorization: 'Basic dXNlcjpwYXNz' })), null);
    assert.equal(extractApiKey(new Headers({ Authorization: 'Bearer' })), null);
  });
});

describe('loadConfig', () => {
  it('applies defaults and strips a trailing slash', () => {
    assert.deepEqual(loadConfig({ API_BASE_URL: 'http://api:3000/api/' }), {
      API_BASE_URL: 'http://api:3000/api',
      MCP_PORT: 3001,
      API_TIMEOUT_MS: 10_000,
    });
  });

  it('parses numbers from strings', () => {
    const config = loadConfig({ API_BASE_URL: 'http://x/api', MCP_PORT: '4000', API_TIMEOUT_MS: '2500' });
    assert.equal(config.MCP_PORT, 4000);
    assert.equal(config.API_TIMEOUT_MS, 2500);
  });

  it('fails fast with a clear message listing every problem', () => {
    assert.throws(
      () => loadConfig({ API_BASE_URL: 'not a url', MCP_PORT: 'abc' }),
      (error: Error) =>
        error.message.startsWith('Invalid MCP server configuration:') &&
        error.message.includes('API_BASE_URL') &&
        error.message.includes('MCP_PORT'),
    );
  });

  it('requires API_BASE_URL', () => {
    assert.throws(() => loadConfig({}), /API_BASE_URL/);
  });
});
