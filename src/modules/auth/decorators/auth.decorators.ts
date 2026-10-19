import {
  createParamDecorator,
  type ExecutionContext,
  InternalServerErrorException,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import { actorFromRequest, type RequestActor } from '../../audit/request-actor';
import type { UserRole } from '../../users/enums/user-role.enum';
import type { AuthPrincipal } from '../types/auth-principal';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const ROLES_KEY = 'auth:roles';

/** The route needs no credentials. Both global guards let it through. */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);

/**
 * The roles allowed on the route. There is no role hierarchy: list every role
 * explicitly. A protected route without @Roles is denied (fail-closed).
 */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

/** The authenticated principal. Only valid on non-@Public routes (the guards guarantee it is set). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthPrincipal => {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.user) {
      // Programming error: @CurrentUser used on a @Public route.
      throw new InternalServerErrorException(
        'No authenticated principal on this route',
      );
    }
    return request.user;
  },
);

/** Principal + request id + IP, for audit logging in services. */
export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestActor =>
    actorFromRequest(context.switchToHttp().getRequest<Request>()),
);
