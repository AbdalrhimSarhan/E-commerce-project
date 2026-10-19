import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_LINKS_PER_REQUEST } from '../../../common/dto/limits';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  toBooleanQuery,
  trim,
  trimToNull,
} from '../../../common/dto/transforms';

/** "19.9", 19.9 and "19.90" are all accepted and stored as numeric(12,2). */
const PRICE_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

function toPriceString({ value }: { value: unknown }): unknown {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' ? value.trim() : value;
}

function toSku({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export class CreateProductDto {
  @ApiProperty({
    example: 'KB-001',
    description: 'Unique, stored uppercase. Letters, digits, "-"',
  })
  @Transform(toSku)
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9-]{0,63}$/, {
    message:
      'sku must be 1-64 characters: letters, digits and "-", starting with a letter or digit',
  })
  sku!: string;

  @ApiProperty({ example: 'Mechanical keyboard', maxLength: 200 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    example: 'Hot-swappable switches, RGB',
    maxLength: 5000,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ApiProperty({
    example: '129.90',
    type: String,
    description: 'Decimal with up to 2 places; a JSON number is also accepted',
  })
  @Transform(toPriceString)
  @IsString()
  @Matches(PRICE_PATTERN, {
    message:
      'price must be a non-negative amount with at most 2 decimal places',
  })
  price!: string;

  @ApiPropertyOptional({ example: 25, minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  stock?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Categories to put the product into',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(MAX_LINKS_PER_REQUEST)
  @IsUUID('all', { each: true })
  categoryIds?: string[];
}

/** Every field optional. `categoryIds`, when sent, REPLACES the product's categories. */
export class UpdateProductDto extends PartialType(CreateProductDto) {}

export const PRODUCT_SORT_FIELDS = [
  'name',
  'sku',
  'price',
  'createdAt',
] as const;
export type ProductSortField = (typeof PRODUCT_SORT_FIELDS)[number];

export class ListProductsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Case-insensitive match on name or SKU' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Only products in this category',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(toBooleanQuery)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: PRODUCT_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(PRODUCT_SORT_FIELDS)
  sortBy: ProductSortField = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}

export class CategorySummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Keyboards' })
  name!: string;
}

export class ProductResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'KB-001' })
  sku!: string;

  @ApiProperty({ example: 'Mechanical keyboard' })
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ example: '129.90', description: 'Decimal string (exact)' })
  price!: string;

  @ApiProperty({ example: 25 })
  stock!: number;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: [CategorySummaryDto] })
  @Type(() => CategorySummaryDto)
  categories!: CategorySummaryDto[];

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}
