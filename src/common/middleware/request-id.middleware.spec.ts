import type { NextFunction, Request, Response } from 'express';
import { getRequestId } from '../context/request-context';
import { requestIdMiddleware } from './request-id.middleware';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function run(incomingHeader?: string): {
  req: Request;
  headers: Record<string, string>;
  idInsideNext: string | undefined;
} {
  const headers: Record<string, string> = {};
  const req = {
    header: (name: string) =>
      name.toLowerCase() === 'x-request-id' ? incomingHeader : undefined,
  } as unknown as Request;
  const res = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  } as unknown as Response;

  let idInsideNext: string | undefined;
  const next: NextFunction = () => {
    idInsideNext = getRequestId();
  };

  requestIdMiddleware(req, res, next);
  return { req, headers, idInsideNext };
}

describe('requestIdMiddleware', () => {
  it('reuses a valid client-sent X-Request-Id', () => {
    const { req, headers, idInsideNext } = run('client-id-123');

    expect(req.requestId).toBe('client-id-123');
    expect(headers['X-Request-Id']).toBe('client-id-123');
    expect(idInsideNext).toBe('client-id-123');
  });

  it.each([
    ['missing', undefined],
    ['containing spaces', 'bad id'],
    ['containing symbols', 'abc$%'],
    ['longer than 64 chars', 'a'.repeat(65)],
    ['empty', ''],
  ])('generates a UUID when the header is %s', (_label, header) => {
    const { req, headers, idInsideNext } = run(header);

    expect(req.requestId).toMatch(UUID_PATTERN);
    expect(headers['X-Request-Id']).toBe(req.requestId);
    expect(idInsideNext).toBe(req.requestId);
  });

  it('makes the id available only inside the request chain', () => {
    run('scoped-id');

    expect(getRequestId()).toBeUndefined();
  });
});
