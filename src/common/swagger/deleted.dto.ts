import { ApiProperty } from '@nestjs/swagger';

/** Payload of every successful DELETE (200, not 204, to keep the envelope). */
export class DeletedDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
}
