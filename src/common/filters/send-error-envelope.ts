import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { REQUEST_ID_HEADER } from '../constants/request-id';
import type { ErrorEnvelope } from '../envelope/envelope.types';
import { mapException } from './exception-mapper';

const logger = new Logger('ExceptionHandler');

/**
 * Maps an exception and writes the error envelope. Shared by the global
 * exception filter and plain Express middleware, which Nest filters don't cover.
 * Unexpected errors are logged with their stack and the request id; the client
 * only gets a generic message.
 */
export function sendErrorEnvelope(
  exception: unknown,
  request: Request,
  response: Response,
): void {
  // requestIdMiddleware always runs first; this fallback only guards the envelope contract.
  const requestId = request.requestId ?? randomUUID();
  const { status, body, isUnexpected } = mapException(exception);

  if (isUnexpected) {
    logger.error(
      `Unhandled error on ${request.method} ${request.originalUrl} (requestId=${requestId})`,
      exception instanceof Error ? exception.stack : String(exception),
    );
  }

  if (response.headersSent) {
    return;
  }

  const envelope: ErrorEnvelope = {
    success: false,
    error: body,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    },
  };

  response.setHeader(REQUEST_ID_HEADER, requestId);
  response.status(status).json(envelope);
}
