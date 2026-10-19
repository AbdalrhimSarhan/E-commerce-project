import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../users/enums/user-role.enum';

/** The current principal (GET /auth/me). */
export class MeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'admin@example.com' })
  email!: string;

  @ApiProperty({ example: 'Admin' })
  name!: string;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole' })
  role!: UserRole;

  @ApiProperty({ enum: ['user', 'agent'] })
  actorType!: 'user' | 'agent';

  @ApiProperty({ enum: ['jwt', 'api_key'] })
  authMethod!: 'jwt' | 'api_key';

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Only for authMethod jwt',
  })
  sessionId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Only for authMethod api_key',
  })
  apiKeyId?: string;
}
