import type { AuthPrincipal } from '../../modules/auth/types/auth-principal';

// Adds our own properties to the Express Request type.
declare global {
  namespace Express {
    interface Request {
      /** Set by requestIdMiddleware, which runs first on every request. */
      requestId: string;
      /** Set by AuthenticationMiddleware when valid credentials were sent. */
      user?: AuthPrincipal;
    }
  }
}

export {};
