import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuditService } from '../../audit/audit.service';
import { AuditAction, AuditOutcome } from '../../audit/enums/audit.enums';
import { actorFromRequest } from '../../audit/request-actor';
import type { UserRole } from '../../users/enums/user-role.enum';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../decorators/auth.decorators';

type DenialReason = 'no_roles_declared' | 'role_not_allowed';

/**
 * Global guard #2 (runs after AuthenticatedGuard): the principal's role must be
 * listed in the route's @Roles. FAIL-CLOSED: a protected route without @Roles is
 * denied, so a forgotten decorator can never open a route.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    if (
      this.reflector.getAllAndOverride<boolean | undefined>(
        IS_PUBLIC_KEY,
        targets,
      )
    ) {
      return true;
    }

    const allowedRoles = this.reflector.getAllAndOverride<
      UserRole[] | undefined
    >(ROLES_KEY, targets);
    const request = context.switchToHttp().getRequest<Request>();

    if (!allowedRoles || allowedRoles.length === 0) {
      this.logger.warn(
        `Route ${this.routeName(context)} (${request.method} ${request.originalUrl}) ` +
          'has no @Roles metadata: denied (fail-closed)',
      );
      await this.onDenied(context, request, 'no_roles_declared', []);
    }

    // AuthenticatedGuard ran first, so request.user is set on a non-public route.
    const role = request.user?.role;
    if (role === undefined || !allowedRoles?.includes(role)) {
      await this.onDenied(
        context,
        request,
        'role_not_allowed',
        allowedRoles ?? [],
      );
    }

    return true;
  }

  /**
   * The single place every denial goes through: records the attempt in the
   * audit log, then throws 403. An audit failure is logged but never turns a
   * denial into a different response.
   */
  private async onDenied(
    context: ExecutionContext,
    request: Request,
    reason: DenialReason,
    allowedRoles: UserRole[],
  ): Promise<never> {
    try {
      await this.audit.recordStandalone({
        actor: actorFromRequest(request),
        action: AuditAction.AccessDenied,
        outcome: AuditOutcome.Denied,
        metadata: {
          reason,
          method: request.method,
          path: request.originalUrl,
          route: this.routeName(context),
          allowedRoles,
        },
      });
    } catch (error) {
      this.logger.error(
        `Could not write the audit row for a denied request (requestId=${request.requestId})`,
        error instanceof Error ? error.stack : String(error),
      );
    }
    throw new ForbiddenException(
      'You do not have permission to perform this action',
    );
  }

  private routeName(context: ExecutionContext): string {
    return `${context.getClass().name}.${context.getHandler().name}`;
  }
}
