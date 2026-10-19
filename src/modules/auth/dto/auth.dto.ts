import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { trim } from '../../../common/dto/transforms';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_PATTERN,
  PASSWORD_RULE_MESSAGE,
} from '../../users/constants/password-policy';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { normalizeEmail } from '../../users/utils/normalize-email';

const toEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeEmail(value) : value;

/**
 * Registration always creates role 'user'. There is no `role` property, so
 * sending one is rejected by the global ValidationPipe (forbidNonWhitelisted).
 */
export class RegisterDto {
  @ApiProperty({ example: 'jane@example.com', maxLength: 255 })
  @Transform(toEmail)
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: 'Jane Doe', maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    example: 'Secret123',
    minLength: 8,
    maxLength: PASSWORD_MAX_LENGTH,
    description: PASSWORD_RULE_MESSAGE,
  })
  @IsString()
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_RULE_MESSAGE })
  password!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'admin@example.com' })
  @Transform(toEmail)
  @IsEmail()
  @MaxLength(255)
  email!: string;

  /** Not checked against the policy here: a wrong password simply fails. */
  @ApiProperty({ example: 'Admin12345' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}

export class RefreshDto {
  @ApiProperty({
    description: 'The refresh token from login or the last refresh',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  refreshToken!: string;
}

export class AuthTokensDto {
  @ApiProperty({
    description: 'JWT (HS256). Send as `Authorization: Bearer <token>`',
  })
  accessToken!: string;

  @ApiProperty({
    description:
      'Opaque `<sessionId>.<secret>`. One-time use: every refresh returns a new one',
  })
  refreshToken!: string;

  @ApiProperty({
    example: 900,
    description: 'Access token lifetime in seconds',
  })
  accessTokenExpiresIn!: number;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;
}

export class LogoutResultDto {
  @ApiProperty({ example: 1, description: 'Number of sessions revoked' })
  revokedSessions!: number;
}
