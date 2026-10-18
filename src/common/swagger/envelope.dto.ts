import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ErrorCode } from '../constants/error-codes';

// Classes used only to describe the response envelope in Swagger.
// The runtime types live in common/envelope/envelope.types.ts.

export class RequestMetaDto {
  @ApiProperty({
    format: 'uuid',
    example: '6f1c1b8e-2f0a-4c2e-9d55-0b1f3c2a7e11',
  })
  requestId!: string;

  @ApiProperty({ format: 'date-time', example: '2026-10-18T12:00:00.000Z' })
  timestamp!: string;
}

export class PaginationMetaDto extends RequestMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 57 })
  total!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}

export class ErrorMetaDto extends RequestMetaDto {
  @ApiProperty({ example: '/api/health' })
  path!: string;
}

export class ErrorDetailDto {
  @ApiProperty({ example: 'email' })
  field!: string;

  @ApiProperty({ example: 'email must be an email' })
  message!: string;
}

export class ErrorBodyDto {
  @ApiProperty({ enum: ErrorCode, enumName: 'ErrorCode' })
  code!: ErrorCode;

  @ApiProperty({ example: 'Validation failed' })
  message!: string;

  @ApiPropertyOptional({ type: [ErrorDetailDto] })
  details?: ErrorDetailDto[];
}

export class ErrorEnvelopeDto {
  @ApiProperty({ example: false })
  success!: false;

  @ApiProperty({ type: ErrorBodyDto })
  error!: ErrorBodyDto;

  @ApiProperty({ type: ErrorMetaDto })
  meta!: ErrorMetaDto;
}
