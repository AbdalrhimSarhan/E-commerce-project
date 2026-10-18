// Adds our own properties to the Express Request type.
declare global {
  namespace Express {
    interface Request {
      /** Set by requestIdMiddleware, which runs first on every request. */
      requestId: string;
    }
  }
}

export {};
