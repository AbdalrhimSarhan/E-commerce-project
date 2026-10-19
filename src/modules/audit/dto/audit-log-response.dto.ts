import { ApiProperty } from '@nestjs/swagger';
import { AuditActorType, AuditOutcome } from '../enums/audit.enums';

export class AuditLogResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: Date;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  actorId!: string | null;

  @ApiProperty({ enum: AuditActorType })
  actorType!: AuditActorType;

  @ApiProperty({ nullable: true, type: String })
  actorEmail!: string | null;

  @ApiProperty({ nullable: true, type: String, example: 'admin' })
  actorRole!: string | null;

  @ApiProperty({ nullable: true, type: String, example: 'jwt' })
  authMethod!: string | null;

  @ApiProperty({ example: 'product.update' })
  action!: string;

  @ApiProperty({ enum: AuditOutcome })
  outcome!: AuditOutcome;

  @ApiProperty({ nullable: true, type: String, example: 'product' })
  resourceType!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  resourceId!: string | null;

  @ApiProperty({
    nullable: true,
    type: 'object',
    additionalProperties: true,
    example: { price: { from: '9.99', to: '12.50' } },
  })
  changes!: Record<string, unknown> | null;

  @ApiProperty({ nullable: true, type: 'object', additionalProperties: true })
  metadata!: Record<string, unknown> | null;

  @ApiProperty({ nullable: true, type: String })
  requestId!: string | null;

  @ApiProperty({ nullable: true, type: String })
  ipAddress!: string | null;
}
