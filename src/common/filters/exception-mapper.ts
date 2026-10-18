import { HttpException, HttpStatus } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import {
  DEFAULT_ERROR_MESSAGES,
  ErrorCode,
  STATUS_TO_ERROR_CODE,
} from '../constants/error-codes';
import type { ErrorBody, ErrorDetail } from '../envelope/envelope.types';
import { ValidationException } from '../exceptions/validation.exception';

export interface MappedError {
  status: number;
  body: ErrorBody;
  /** true when the error is unexpected and must be logged with its stack. */
  isUnexpected: boolean;
}

/** PostgreSQL error codes we translate into client errors. */
const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_CHECK_VIOLATION = '23514';

/**
 * Translates any thrown value into an HTTP status and an error body.
 * Never puts internal details (SQL, stack, constraint names) into the body.
 */
export function mapException(exception: unknown): MappedError {
  if (exception instanceof ValidationException) {
    return clientError(
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR,
      DEFAULT_ERROR_MESSAGES[ErrorCode.VALIDATION_ERROR],
      exception.details,
    );
  }

  if (exception instanceof HttpException) {
    return mapHttpException(exception);
  }

  if (exception instanceof QueryFailedError) {
    // driverError is typed `any` by TypeORM; treat it as unknown and narrow.
    const driverError: unknown = exception.driverError;
    return mapDatabaseError(driverError);
  }

  // Errors from Express middleware (e.g. body-parser on malformed JSON) are
  // plain errors with a 4xx `status`. Their message is safe for the client.
  const httpLike = getHttpLikeStatus(exception);
  if (httpLike !== undefined) {
    const code = codeForClientStatus(httpLike);
    return clientError(httpLike, code, messageOf(exception, code));
  }

  return internalError();
}

function mapHttpException(exception: HttpException): MappedError {
  const status = exception.getStatus();

  if (status === Number(HttpStatus.SERVICE_UNAVAILABLE)) {
    return {
      status,
      body: {
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: DEFAULT_ERROR_MESSAGES[ErrorCode.SERVICE_UNAVAILABLE],
        ...detailsFromHealthResult(exception.getResponse()),
      },
      isUnexpected: false,
    };
  }

  if (status >= 500) {
    return internalError();
  }

  const code = codeForClientStatus(status);
  return clientError(status, code, messageOf(exception.getResponse(), code));
}

function mapDatabaseError(driverError: unknown): MappedError {
  const pgCode =
    isRecord(driverError) && typeof driverError.code === 'string'
      ? driverError.code
      : undefined;

  switch (pgCode) {
    case PG_UNIQUE_VIOLATION:
      return clientError(
        HttpStatus.CONFLICT,
        ErrorCode.CONFLICT,
        'A resource with the same unique value already exists',
      );
    case PG_FOREIGN_KEY_VIOLATION:
      return clientError(
        HttpStatus.CONFLICT,
        ErrorCode.CONFLICT,
        'The operation conflicts with a related resource',
      );
    case PG_CHECK_VIOLATION:
      return clientError(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'A value violates a data constraint',
      );
    default:
      return internalError();
  }
}

function codeForClientStatus(status: number): ErrorCode {
  return STATUS_TO_ERROR_CODE[status] ?? ErrorCode.BAD_REQUEST;
}

/** Picks a human-readable message from an exception response, or the code's default. */
function messageOf(response: unknown, code: ErrorCode): string {
  if (typeof response === 'string' && response.length > 0) {
    return response;
  }
  if (isRecord(response)) {
    const { message } = response;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
    if (Array.isArray(message) && message.length > 0) {
      return message.map(String).join('; ');
    }
  }
  return DEFAULT_ERROR_MESSAGES[code];
}

/**
 * Terminus puts `{ error: { database: { status: 'down', message } } }` in the
 * 503 response. Only the check name and its status are returned: the message
 * can contain host names or driver errors (the health endpoint is public).
 */
function detailsFromHealthResult(response: unknown): {
  details?: ErrorDetail[];
} {
  if (!isRecord(response) || !isRecord(response.error)) {
    return {};
  }
  const details = Object.entries(response.error).map(([field, value]) => ({
    field,
    message:
      isRecord(value) && typeof value.status === 'string'
        ? value.status
        : 'down',
  }));
  return details.length > 0 ? { details } : {};
}

function getHttpLikeStatus(exception: unknown): number | undefined {
  if (!(exception instanceof Error) || !isRecord(exception)) {
    return undefined;
  }
  const status = exception.status ?? exception.statusCode;
  return typeof status === 'number' && status >= 400 && status < 500
    ? status
    : undefined;
}

function clientError(
  status: number,
  code: ErrorCode,
  message: string,
  details?: ErrorDetail[],
): MappedError {
  return {
    status,
    body: details ? { code, message, details } : { code, message },
    isUnexpected: false,
  };
}

function internalError(): MappedError {
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: {
      code: ErrorCode.INTERNAL_ERROR,
      message: DEFAULT_ERROR_MESSAGES[ErrorCode.INTERNAL_ERROR],
    },
    isUnexpected: true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
