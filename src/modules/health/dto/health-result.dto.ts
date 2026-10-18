import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const indicatorMapSchema = {
  type: 'object' as const,
  additionalProperties: {
    type: 'object' as const,
    properties: { status: { type: 'string' as const, example: 'up' } },
  },
  example: { database: { status: 'up' } },
};

/** Swagger description of the terminus health check result (the `data` field). */
export class HealthResultDto {
  @ApiProperty({
    enum: ['ok', 'error', 'degraded', 'shutting_down'],
    example: 'ok',
  })
  status!: string;

  @ApiPropertyOptional(indicatorMapSchema)
  info?: Record<string, unknown>;

  @ApiPropertyOptional({ ...indicatorMapSchema, example: {} })
  error?: Record<string, unknown>;

  @ApiProperty(indicatorMapSchema)
  details!: Record<string, unknown>;
}
