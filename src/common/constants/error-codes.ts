import { HttpStatus } from '@nestjs/common';

/**
 * Stable error codes returned in `error.code`. The frontend relies on them,
 * so never rename a value; only add new ones.
 */
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  /** Any other 4xx without a specific code (e.g. 405, 413, 415). */
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  /** A dependency (e.g. the database) is down. Used by the health check. */
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

/** HTTP statuses that have their own error code. */
export const STATUS_TO_ERROR_CODE: Readonly<
  Partial<Record<number, ErrorCode>>
> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_ERROR,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.TOO_MANY_REQUESTS,
  [HttpStatus.INTERNAL_SERVER_ERROR]: ErrorCode.INTERNAL_ERROR,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_UNAVAILABLE,
};

/** Default message per code, used when the exception has no useful message. */
export const DEFAULT_ERROR_MESSAGES: Readonly<Record<ErrorCode, string>> = {
  [ErrorCode.VALIDATION_ERROR]: 'Validation failed',
  [ErrorCode.BAD_REQUEST]: 'Bad request',
  [ErrorCode.UNAUTHORIZED]: 'Unauthorized',
  [ErrorCode.FORBIDDEN]: 'Forbidden',
  [ErrorCode.NOT_FOUND]: 'Resource not found',
  [ErrorCode.CONFLICT]: 'Conflict',
  [ErrorCode.TOO_MANY_REQUESTS]: 'Too many requests',
  [ErrorCode.INTERNAL_ERROR]: 'Internal server error',
  [ErrorCode.SERVICE_UNAVAILABLE]: 'Service unavailable',
};
