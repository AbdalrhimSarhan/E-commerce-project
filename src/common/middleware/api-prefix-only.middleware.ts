import { NotFoundException } from '@nestjs/common';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { sendErrorEnvelope } from '../filters/send-error-envelope';

/**
 * Nest only handles "not found" under the global prefix, so a request like
 * GET /foo would get Express's default HTML 404. This middleware answers every
 * request outside the prefix with the 404 error envelope instead.
 */
export function apiPrefixOnly(prefix: string): RequestHandler {
  const base = `/${prefix}`;

  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.path === base || req.path.startsWith(`${base}/`)) {
      next();
      return;
    }
    sendErrorEnvelope(
      new NotFoundException(`Cannot ${req.method} ${req.path}`),
      req,
      res,
    );
  };
}
