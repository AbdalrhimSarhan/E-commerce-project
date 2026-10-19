import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { MAX_LINKS_PER_REQUEST } from '../../../common/dto/limits';
import { trim, trimToNull } from '../../../common/dto/transforms';

export class CreateCategoryDto {
  @ApiProperty({
    example: 'Keyboards',
    maxLength: 100,
    description: 'Unique (case-insensitive)',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    example: 'Mechanical and membrane keyboards',
    maxLength: 2000,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Products to put into the new category',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(MAX_LINKS_PER_REQUEST)
  @IsUUID('all', { each: true })
  productIds?: string[];
}

/** Name and/or description. Links are managed with the /products sub-resource. */
export class UpdateCategoryDto extends PartialType(
  OmitType(CreateCategoryDto, ['productIds'] as const),
) {}

export class CategoryProductIdsDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(MAX_LINKS_PER_REQUEST)
  @IsUUID('all', { each: true })
  productIds!: string[];
}

export class ListCategoriesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Case-insensitive match on the name' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class CategoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Keyboards' })
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({
    example: 12,
    description: 'Number of products in the category',
  })
  productCount!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class ProductSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'KB-001' })
  sku!: string;

  @ApiProperty({ example: 'Mechanical keyboard' })
  name!: string;

  @ApiProperty({ example: '129.90' })
  price!: string;

  @ApiProperty()
  isActive!: boolean;
}

export class CategoryDetailDto extends CategoryResponseDto {
  @ApiProperty({
    type: [ProductSummaryDto],
    description: 'Products in the category, by name',
  })
  products!: ProductSummaryDto[];
}
