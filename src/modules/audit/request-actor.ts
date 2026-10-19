import type { Request } from 'express';
import type { AuthPrincipal } from '../auth/types/auth-principal';

/**
 * Who performed an action and from where. Built from the request by the
 * controller (see @CurrentActor) and passed explicitly to every service method
 * that writes, so each write can record its audit row in the same transaction.
 */
export interface RequestActor {
  principal: AuthPrincipal | null;
  requestId: string;
  ipAddress: string | null;
}

export function actorFromRequest(request: Request): RequestActor {
  return {
    principal: request.user ?? null,
    requestId: request.requestId,
    ipAddress: request.ip ?? null,
  };
}
