import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { ErrorCode } from '../constants/error-codes';
import { ValidationException } from '../exceptions/validation.exception';
import { mapException } from './exception-mapper';

function queryFailed(pgCode: string): QueryFailedError {
  const driverError = Object.assign(new Error('duplicate key value'), {
    code: pgCode,
    constraint: 'UQ_users_email',
  });
  return new QueryFailedError('INSERT INTO users ...', [], driverError);
}

describe('mapException', () => {
  it('maps ValidationException to 400 VALIDATION_ERROR with details', () => {
    const details = [{ field: 'email', message: 'email must be an email' }];

    expect(mapException(new ValidationException(details))).toEqual({
      status: 400,
      body: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        details,
      },
      isUnexpected: false,
    });
  });

  it.each([
    [
      new UnauthorizedException('Invalid credentials'),
      401,
      ErrorCode.UNAUTHORIZED,
      'Invalid credentials',
    ],
    [new ForbiddenException(), 403, ErrorCode.FORBIDDEN, 'Forbidden'],
    [
      new NotFoundException('Cannot GET /api/nope'),
      404,
      ErrorCode.NOT_FOUND,
      'Cannot GET /api/nope',
    ],
    [
      new HttpException('Too Many Requests', 429),
      429,
      ErrorCode.TOO_MANY_REQUESTS,
      'Too Many Requests',
    ],
  ])('maps %p to its fixed code', (exception, status, code, message) => {
    expect(mapException(exception)).toEqual({
      status,
      body: { code, message },
      isUnexpected: false,
    });
  });

  it('maps other 4xx statuses to BAD_REQUEST and keeps the status', () => {
    const result = mapException(
      new HttpException('Payload Too Large', HttpStatus.PAYLOAD_TOO_LARGE),
    );

    expect(result.status).toBe(413);
    expect(result.body.code).toBe(ErrorCode.BAD_REQUEST);
  });

  it('maps a terminus 503 to SERVICE_UNAVAILABLE with per-check details', () => {
    const exception = new ServiceUnavailableException({
      status: 'error',
      info: {},
      error: { database: { status: 'down', message: 'timeout' } },
      details: { database: { status: 'down', message: 'timeout' } },
    });

    expect(mapException(exception)).toEqual({
      status: 503,
      body: {
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'Service unavailable',
        details: [{ field: 'database', message: 'down' }],
      },
      isUnexpected: false,
    });
  });

  it.each([
    ['23505', 409, ErrorCode.CONFLICT],
    ['23503', 409, ErrorCode.CONFLICT],
    ['23514', 400, ErrorCode.VALIDATION_ERROR],
  ])('maps PostgreSQL error %s to %s', (pgCode, status, code) => {
    const result = mapException(queryFailed(pgCode));

    expect(result.status).toBe(status);
    expect(result.body.code).toBe(code);
    expect(result.isUnexpected).toBe(false);
    // Never leak SQL or constraint names.
    expect(JSON.stringify(result.body)).not.toMatch(/UQ_users_email|INSERT/);
  });

  it('maps an unknown PostgreSQL error to 500', () => {
    expect(mapException(queryFailed('42P01')).status).toBe(500);
  });

  it('maps a malformed-JSON body-parser error to 400', () => {
    const parserError = Object.assign(new SyntaxError('Unexpected token'), {
      status: 400,
      type: 'entity.parse.failed',
    });

    expect(mapException(parserError)).toMatchObject({
      status: 400,
      body: { code: ErrorCode.VALIDATION_ERROR },
    });
  });

  it.each([
    ['a plain Error', new Error('connection string postgres://secret')],
    ['an HTTP 500', new InternalServerErrorException('db password wrong')],
    ['a thrown string', 'boom'],
  ])('hides internal details for %s', (_label, exception) => {
    expect(mapException(exception)).toEqual({
      status: 500,
      body: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Internal server error',
      },
      isUnexpected: true,
    });
  });
});
