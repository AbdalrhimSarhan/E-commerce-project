import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mapApiError, type ToolErrorCode, upstreamUnavailable } from '../../src/errors.ts';

const envelope = (code: string, message: string, details?: unknown) => ({
  success: false,
  error: { code, message, ...(details !== undefined && { details }) },
  meta: { requestId: 'api-rid', timestamp: '2026-10-20T00:00:00.000Z', path: '/api/x' },
});

describe('mapApiError', () => {
  const cases: Array<[number, ToolErrorCode]> = [
    [400, 'VALIDATION_ERROR'],
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
    [429, 'TOO_MANY_REQUESTS'],
    [500, 'INTERNAL_ERROR'],
    [503, 'SERVICE_UNAVAILABLE'],
    [405, 'BAD_REQUEST'],
  ];

  for (const [status, code] of cases) {
    it(`keeps the API's ${code} code, message and request id (HTTP ${status})`, () => {
      assert.deepEqual(mapApiError(status, envelope(code, `msg ${code}`), 'local-rid'), {
        code,
        message: `msg ${code}`,
        requestId: 'api-rid',
      });
    });
  }

  it('passes validation details through', () => {
    const details = [{ field: 'name', message: 'name should not be empty' }];
    assert.deepEqual(mapApiError(400, envelope('VALIDATION_ERROR', 'Validation failed', details), 'r'), {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details,
      requestId: 'api-rid',
    });
  });

  it('drops malformed detail entries', () => {
    const result = mapApiError(400, envelope('VALIDATION_ERROR', 'x', [{ field: 1 }, 'nope']), 'r');
    assert.equal(result.details, undefined);
  });

  for (const [status, code] of cases) {
    it(`falls back to the HTTP status when the body is not an envelope (${status} -> ${code})`, () => {
      const result = mapApiError(status, '<html>proxy error</html>', 'local-rid');
      assert.equal(result.code, code);
      assert.equal(result.requestId, 'local-rid');
      assert.equal(result.message, `The API answered with HTTP ${status}`);
    });
  }

  it('ignores an unknown code from the API and uses the status', () => {
    assert.equal(mapApiError(409, envelope('SOMETHING_NEW', 'x'), 'r').code, 'CONFLICT');
  });
});

describe('upstreamUnavailable', () => {
  it('reports a timeout without internals', () => {
    const error = upstreamUnavailable('rid', true);
    assert.equal(error.code, 'UPSTREAM_UNAVAILABLE');
    assert.match(error.message, /did not answer in time/);
    assert.deepEqual(Object.keys(error).sort(), ['code', 'message', 'requestId']);
  });

  it('reports an unreachable API without internals', () => {
    assert.match(upstreamUnavailable('rid', false).message, /not reachable/);
  });
});
