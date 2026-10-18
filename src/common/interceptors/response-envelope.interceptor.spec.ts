import { CallHandler, ExecutionContext, StreamableFile } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { PaginatedResult } from '../pagination/paginated-result';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor';

function httpContext(requestId: string): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ requestId }) }),
  } as unknown as ExecutionContext;
}

function handlerReturning(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

describe('ResponseEnvelopeInterceptor', () => {
  const interceptor = new ResponseEnvelopeInterceptor();

  it('wraps a payload in the success envelope', async () => {
    const result = await firstValueFrom(
      interceptor.intercept(
        httpContext('rid-1'),
        handlerReturning({ id: 'x' }),
      ),
    );

    expect(result).toEqual({
      success: true,
      data: { id: 'x' },
      meta: { requestId: 'rid-1', timestamp: expect.any(String) as string },
    });
  });

  it('turns undefined into data: null', async () => {
    const result = await firstValueFrom(
      interceptor.intercept(httpContext('rid-2'), handlerReturning(undefined)),
    );

    expect(result).toMatchObject({ success: true, data: null });
  });

  it('moves pagination numbers into meta', async () => {
    const page = new PaginatedResult([{ id: 'a' }, { id: 'b' }], 45, 2, 20);

    const result = await firstValueFrom(
      interceptor.intercept(httpContext('rid-3'), handlerReturning(page)),
    );

    expect(result).toEqual({
      success: true,
      data: [{ id: 'a' }, { id: 'b' }],
      meta: {
        requestId: 'rid-3',
        timestamp: expect.any(String) as string,
        page: 2,
        limit: 20,
        total: 45,
        totalPages: 3,
      },
    });
  });

  it('passes files through untouched', async () => {
    const file = new StreamableFile(Buffer.from('data'));

    const result = await firstValueFrom(
      interceptor.intercept(httpContext('rid-4'), handlerReturning(file)),
    );

    expect(result).toBe(file);
  });
});
