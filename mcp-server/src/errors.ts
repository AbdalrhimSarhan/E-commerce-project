/**
 * Error codes a tool can return. All but UPSTREAM_UNAVAILABLE come straight
 * from the API's error envelope, so the agent sees exactly why the API
 * refused a call.
 */
export type ToolErrorCode =
  | 'VALIDATION_ERROR'
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'
  /** The API could not be reached or did not answer in time. */
  | 'UPSTREAM_UNAVAILABLE';

export interface ToolErrorDetail {
  field: string;
  message: string;
}

export interface ToolError {
  code: ToolErrorCode;
  message: string;
  details?: ToolErrorDetail[];
  /** The X-Request-Id of the API call: find it in the API logs and the audit log. */
  requestId: string;
}

const KNOWN_CODES: ReadonlySet<string> = new Set<ToolErrorCode>([
  'VALIDATION_ERROR',
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'TOO_MANY_REQUESTS',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
]);

/** Fallback when the API answered with something that is not our envelope. */
function codeForStatus(status: number): ToolErrorCode {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'TOO_MANY_REQUESTS';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseDetails(value: unknown): ToolErrorDetail[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const details = value.flatMap((item): ToolErrorDetail[] =>
    isRecord(item) && typeof item.field === 'string' && typeof item.message === 'string'
      ? [{ field: item.field, message: item.message }]
      : [],
  );
  return details.length > 0 ? details : undefined;
}

/**
 * Maps a non-2xx API response to a tool error. Uses the API's own error
 * envelope `{ success: false, error: { code, message, details? }, meta: { requestId } }`
 * when present; otherwise falls back to the HTTP status.
 */
export function mapApiError(status: number, body: unknown, requestId: string): ToolError {
  const error = isRecord(body) && isRecord(body.error) ? body.error : undefined;
  const meta = isRecord(body) && isRecord(body.meta) ? body.meta : undefined;

  const code =
    typeof error?.code === 'string' && KNOWN_CODES.has(error.code)
      ? (error.code as ToolErrorCode)
      : codeForStatus(status);
  const message =
    typeof error?.message === 'string' && error.message.length > 0
      ? error.message
      : `The API answered with HTTP ${status}`;
  const details = parseDetails(error?.details);

  return {
    code,
    message,
    ...(details && { details }),
    requestId: typeof meta?.requestId === 'string' ? meta.requestId : requestId,
  };
}

/** Network failure or timeout: no stack, no URL, nothing internal. */
export function upstreamUnavailable(requestId: string, timedOut: boolean): ToolError {
  return {
    code: 'UPSTREAM_UNAVAILABLE',
    message: timedOut
      ? 'The Product Management API did not answer in time. Try again later.'
      : 'The Product Management API is not reachable. Try again later.',
    requestId,
  };
}
