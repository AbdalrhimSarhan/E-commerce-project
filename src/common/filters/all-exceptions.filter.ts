import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { sendErrorEnvelope } from './send-error-envelope';

/**
 * Global filter: turns every exception thrown in Nest (controllers, guards,
 * pipes, Nest middleware) into the error envelope.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    sendErrorEnvelope(
      exception,
      http.getRequest<Request>(),
      http.getResponse<Response>(),
    );
  }
}
