import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheckService,
  TypeOrmHealthIndicator,
  type HealthCheckResult,
} from '@nestjs/terminus';
import {
  ApiErrorEnvelopes,
  ApiOkEnvelope,
} from '../../common/swagger/api-envelope.decorators';
import { HealthResultDto } from './dto/health-result.dto';

const DB_PING_TIMEOUT_MS = 1500;

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness and database connectivity check' })
  @ApiOkEnvelope(HealthResultDto, {
    description: 'The service and its database are up',
  })
  @ApiErrorEnvelopes(HttpStatus.SERVICE_UNAVAILABLE)
  check(): Promise<HealthCheckResult> {
    // Throws ServiceUnavailableException (503) when a check fails.
    return this.health.check([
      () => this.db.pingCheck('database').withTimeout(DB_PING_TIMEOUT_MS),
    ]);
  }
}
