import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { REQUEST_ID_HEADER, REQUEST_ID_PATTERN } from '../constants/request-id';
import { requestContext } from '../context/request-context';

/**
 * Gives every request an id: reuses a valid client-sent X-Request-Id, otherwise
 * generates one. The id is stored on the request, echoed in the response header,
 * and kept in AsyncLocalStorage for the logger.
 *
 * Registered with `app.use()` as the very first middleware, so it also runs for
 * unknown routes and before helmet/CORS.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  const requestId =
    incoming !== undefined && REQUEST_ID_PATTERN.test(incoming)
      ? incoming
      : randomUUID();

  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  requestContext.run({ requestId }, next);
}
