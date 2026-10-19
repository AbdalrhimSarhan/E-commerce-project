import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  ApiErrorEnvelopes,
  ApiOkEnvelope,
} from '../../common/swagger/api-envelope.decorators';
import { API_KEY_AUTH, BEARER_AUTH } from '../../common/swagger/setup-swagger';
import type { RequestActor } from '../audit/request-actor';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UserRole } from '../users/enums/user-role.enum';
import { AuthService } from './auth.service';
import {
  CurrentActor,
  CurrentUser,
  Public,
  Roles,
} from './decorators/auth.decorators';
import {
  AuthTokensDto,
  LoginDto,
  LogoutResultDto,
  RefreshDto,
  RegisterDto,
} from './dto/auth.dto';
import { MeDto } from './dto/me.dto';
import type { AuthPrincipal } from './types/auth-principal';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Create an account (role is always "user")' })
  @ApiOkEnvelope(UserResponseDto, { status: HttpStatus.CREATED })
  @ApiErrorEnvelopes(
    HttpStatus.BAD_REQUEST,
    HttpStatus.CONFLICT,
    HttpStatus.TOO_MANY_REQUESTS,
  )
  register(
    @Body() dto: RegisterDto,
    @CurrentActor() actor: RequestActor,
  ): Promise<UserResponseDto> {
    return this.authService.register(dto, actor);
  }

  @Post('login')
  @Public()
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in with email and password; returns a token pair',
  })
  @ApiOkEnvelope(AuthTokensDto)
  @ApiErrorEnvelopes(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.TOO_MANY_REQUESTS,
  )
  login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @CurrentActor() actor: RequestActor,
  ): Promise<AuthTokensDto> {
    return this.authService.login(
      dto,
      {
        userAgent: req.header('user-agent') ?? null,
        ipAddress: req.ip ?? null,
      },
      actor,
    );
  }

  @Post('refresh')
  @Public()
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange a refresh token for a new pair (rotation)',
    description:
      'Each refresh token works once. Presenting an already-used token revokes the whole session (reuse detection).',
  })
  @ApiOkEnvelope(AuthTokensDto)
  @ApiErrorEnvelopes(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.TOO_MANY_REQUESTS,
  )
  refresh(
    @Body() dto: RefreshDto,
    @CurrentActor() actor: RequestActor,
  ): Promise<AuthTokensDto> {
    return this.authService.refresh(dto.refreshToken, actor);
  }

  @Post('logout')
  @Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.User)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth(BEARER_AUTH)
  @ApiOperation({ summary: 'Revoke the current session' })
  @ApiOkEnvelope(LogoutResultDto)
  @ApiErrorEnvelopes(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
  async logout(
    @CurrentUser() principal: AuthPrincipal,
    @CurrentActor() actor: RequestActor,
  ): Promise<LogoutResultDto> {
    return { revokedSessions: await this.authService.logout(principal, actor) };
  }

  @Post('logout-all')
  @Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.User)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth(BEARER_AUTH)
  @ApiOperation({ summary: 'Revoke every session of the current user' })
  @ApiOkEnvelope(LogoutResultDto)
  @ApiErrorEnvelopes(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
  async logoutAll(
    @CurrentUser() principal: AuthPrincipal,
    @CurrentActor() actor: RequestActor,
  ): Promise<LogoutResultDto> {
    return {
      revokedSessions: await this.authService.logoutAll(principal, actor),
    };
  }

  @Get('me')
  @Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.User, UserRole.Agent)
  @ApiBearerAuth(BEARER_AUTH)
  @ApiSecurity(API_KEY_AUTH)
  @ApiOperation({
    summary: 'The current principal (human via JWT, or agent via API key)',
  })
  @ApiOkEnvelope(MeDto)
  @ApiErrorEnvelopes(HttpStatus.UNAUTHORIZED)
  me(@CurrentUser() principal: AuthPrincipal): Promise<MeDto> {
    return this.authService.me(principal);
  }
}
