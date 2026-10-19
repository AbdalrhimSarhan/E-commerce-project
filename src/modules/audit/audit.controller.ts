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

@ApiTags('audit-logs')
@ApiBearerAuth(BEARER_AUTH)
@Roles(UserRole.SuperAdmin, UserRole.Admin)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({
    summary:
      'Audit trail of every write and every denied attempt (newest first)',
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
