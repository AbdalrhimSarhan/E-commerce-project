export const REQUEST_ID_HEADER = 'X-Request-Id';

/** A client-sent request id is reused only if it matches this pattern. */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
