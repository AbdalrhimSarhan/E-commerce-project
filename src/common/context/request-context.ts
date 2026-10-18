import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextStore {
  requestId: string;
}

/**
 * Holds per-request data for the whole async call chain of a request, so code
 * that has no access to `req` (e.g. the logger) can still read the request id.
 */
export const requestContext = new AsyncLocalStorage<RequestContextStore>();

export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}
