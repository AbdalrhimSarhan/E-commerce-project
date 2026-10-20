import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PaginatedResult } from '../../common/pagination/paginated-result';
import {
  ApiErrorEnvelopes,
  ApiOkEnvelope,
} from '../../common/swagger/api-envelope.decorators';
import { BEARER_AUTH } from '../../common/swagger/setup-swagger';
import { Roles } from '../auth/decorators/auth.decorators';
import { UserRole } from '../users/enums/user-role.enum';
import { AuditService } from './audit.service';
import { AuditLogResponseDto } from './dto/audit-log-response.dto';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import type { AuditLog } from './entities/audit-log.entity';

/**
 * Read-only access to the audit trail, for super_admin ONLY (separation of
 * duties: admins make the catalog changes, so they must not be the ones who
 * review the trail of those changes). Nobody can write: the table is
 * append-only and rows come only from the API's own write paths.
 */
@ApiTags('audit-logs')
@ApiBearerAuth(BEARER_AUTH)
@Roles(UserRole.SuperAdmin)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({
    summary:
      'Audit trail of every write and every denied attempt (newest first)',
    description:
      'super_admin only (separation of duties). admin, user and agent get 403 FORBIDDEN. ' +
      'The audit log is append-only: there is no write endpoint.',
  })
  @ApiOkEnvelope(AuditLogResponseDto, { paginated: true })
  @ApiErrorEnvelopes(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
  )
  list(
    @Query() query: ListAuditLogsQueryDto,
  ): Promise<PaginatedResult<AuditLog>> {
    return this.auditService.list(query);
  }
}
