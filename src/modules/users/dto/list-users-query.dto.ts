import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { toBooleanQuery } from '../../../common/dto/transforms';
import { UserRole } from '../enums/user-role.enum';

export class ListUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: UserRole, enumName: 'UserRole' })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(toBooleanQuery)
  @IsBoolean()
  isActive?: boolean;
}
