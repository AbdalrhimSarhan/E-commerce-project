import type { Request, Response } from 'express';
import { apiPrefixOnly } from './api-prefix-only.middleware';

function call(path: string): {
  nextCalled: boolean;
  status?: number;
  body?: unknown;
} {
  const result: { nextCalled: boolean; status?: number; body?: unknown } = {
    nextCalled: false,
  };
  const req = {
    path,
    method: 'GET',
    originalUrl: path,
    requestId: 'rid-1',
  } as unknown as Request;
  const res = {
    headersSent: false,
    setHeader: () => undefined,
    status(code: number) {
      result.status = code;
      return this;
    },
    json(body: unknown) {
      result.body = body;
    },
  } as unknown as Response;

  apiPrefixOnly('api')(req, res, () => {
    result.nextCalled = true;
  });
  return result;
}

describe('apiPrefixOnly', () => {
  it.each(['/api', '/api/health', '/api/docs'])('lets %s through', (path) => {
    expect(call(path).nextCalled).toBe(true);
  });

  it.each(['/', '/foo', '/apix', '/favicon.ico'])(
    'answers %s with the 404 envelope',
    (path) => {
      const result = call(path);

      expect(result.nextCalled).toBe(false);
      expect(result.status).toBe(404);
      expect(result.body).toMatchObject({
        success: false,
        error: { code: 'NOT_FOUND' },
        meta: { requestId: 'rid-1', path },
      });
    },
  );
});
