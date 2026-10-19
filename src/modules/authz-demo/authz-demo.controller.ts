import { Controller, Get, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { API_KEY_AUTH, BEARER_AUTH } from '../../common/swagger/setup-swagger';
import { CurrentUser, Public, Roles } from '../auth/decorators/auth.decorators';
import type { AuthPrincipal } from '../auth/types/auth-principal';
import { UserRole } from '../users/enums/user-role.enum';

interface DemoResult {
  route: string;
  role?: string;
}

/**
 * TEMPORARY: routes to try the role matrix by hand. Loaded only when
 * NODE_ENV=development (and imported explicitly by the e2e tests).
 * Will be deleted in a later phase.
 */
@ApiTags('authz-demo (development only)')
@ApiBearerAuth(BEARER_AUTH)
@ApiSecurity(API_KEY_AUTH)
@Controller('authz-demo')
export class AuthzDemoController {
  @Get('public')
  @Public()
  @ApiOperation({ summary: '@Public(): anyone' })
  publicRoute(): DemoResult {
    return { route: 'public' };
  }

  @Get('any')
  @Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.User, UserRole.Agent)
  @ApiOperation({ summary: 'Any authenticated role' })
  anyRole(@CurrentUser() user: AuthPrincipal): DemoResult {
    return { route: 'any', role: user.role };
  }

  @Post('admin-only')
  @Roles(UserRole.SuperAdmin, UserRole.Admin)
  @ApiOperation({ summary: 'super_admin, admin' })
  adminOnly(@CurrentUser() user: AuthPrincipal): DemoResult {
    return { route: 'admin-only', role: user.role };
  }

  @Post('admin-agent')
  @Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Agent)
  @ApiOperation({ summary: 'super_admin, admin, agent' })
  adminAgent(@CurrentUser() user: AuthPrincipal): DemoResult {
    return { route: 'admin-agent', role: user.role };
  }

  /** Deliberately has NO @Roles: proves the fail-closed rule (always 403 when authenticated). */
  @Get('no-roles')
  @ApiOperation({ summary: 'No @Roles: always 403 (fail-closed proof)' })
  noRoles(): DemoResult {
    return { route: 'no-roles' };
  }
}
