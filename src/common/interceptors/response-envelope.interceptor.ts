import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import type { Request } from 'express';
import { map, Observable } from 'rxjs';
import type { RequestMeta, SuccessEnvelope } from '../envelope/envelope.types';
import { PaginatedResult } from '../pagination/paginated-result';

/** Wraps every successful HTTP response in `{ success, data, meta }`. */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const request = context.switchToHttp().getRequest<Request>();

    return next
      .handle()
      .pipe(map((payload: unknown) => this.wrap(payload, request.requestId)));
  }

  private wrap(
    payload: unknown,
    requestId: string,
  ): SuccessEnvelope<unknown> | StreamableFile {
    // Files are streamed as is; an envelope would corrupt them.
    if (payload instanceof StreamableFile) {
      return payload;
    }

    const meta: RequestMeta = {
      requestId,
      timestamp: new Date().toISOString(),
    };

    if (payload instanceof PaginatedResult) {
      return {
        success: true,
        data: payload.items,
        meta: {
          ...meta,
          page: payload.page,
          limit: payload.limit,
          total: payload.total,
          totalPages: payload.totalPages,
        },
      };
    }

    return { success: true, data: payload ?? null, meta };
  }
}
