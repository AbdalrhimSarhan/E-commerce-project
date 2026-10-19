import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { PaginatedResult } from '../../common/pagination/paginated-result';
import {
  ApiErrorEnvelopes,
  ApiOkEnvelope,
} from '../../common/swagger/api-envelope.decorators';
import { BEARER_AUTH } from '../../common/swagger/setup-swagger';
import type { RequestActor } from '../audit/request-actor';
import { CurrentActor, Roles } from '../auth/decorators/auth.decorators';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserRole } from './enums/user-role.enum';
import { UsersService } from './users.service';

/** Account management. super_admin only. Users are never deleted: access is removed by deactivation. */
@ApiTags('users')
@ApiBearerAuth(BEARER_AUTH)
@Roles(UserRole.SuperAdmin)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({
    summary: 'List users (paginated, filter by role / isActive)',
  })
  @ApiOkEnvelope(UserResponseDto, { paginated: true })
  @ApiErrorEnvelopes(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
  )
  async list(
    @Query() query: ListUsersQueryDto,
  ): Promise<PaginatedResult<UserResponseDto>> {
    const page = await this.usersService.list(query);
    return new PaginatedResult(
      page.items.map((user) => UserResponseDto.from(user)),
      page.total,
      page.page,
      page.limit,
    );
  }

  @Patch(':id/deactivate')
  @ApiOperation({
    summary:
      'Deactivate a user and revoke all their sessions (one transaction)',
    description: 'A super_admin cannot be deactivated (403).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(UserResponseDto)
  @ApiErrorEnvelopes(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  async deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: RequestActor,
  ): Promise<UserResponseDto> {
    return UserResponseDto.from(await this.usersService.deactivate(id, actor));
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Activate a user (old sessions stay revoked)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(UserResponseDto)
  @ApiErrorEnvelopes(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  async activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: RequestActor,
  ): Promise<UserResponseDto> {
    return UserResponseDto.from(await this.usersService.activate(id, actor));
  }
}
