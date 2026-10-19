import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { PaginatedResult } from '../../common/pagination/paginated-result';
import { DeletedDto } from '../../common/swagger/deleted.dto';
import {
  ApiErrorEnvelopes,
  ApiOkEnvelope,
} from '../../common/swagger/api-envelope.decorators';
import { API_KEY_AUTH, BEARER_AUTH } from '../../common/swagger/setup-swagger';
import type { RequestActor } from '../audit/request-actor';
import { CurrentActor, Roles } from '../auth/decorators/auth.decorators';
import { UserRole } from '../users/enums/user-role.enum';
import {
  CreateProductDto,
  ListProductsQueryDto,
  ProductResponseDto,
  UpdateProductDto,
} from './dto/product.dto';
import { ProductsService } from './products.service';

/** Everyone authenticated can read; only super_admin and admin can modify. */
@ApiTags('products')
@ApiBearerAuth(BEARER_AUTH)
@ApiSecurity(API_KEY_AUTH)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.User, UserRole.Agent)
  @ApiOperation({
    summary: 'List products with their categories (paginated, filterable)',
  })
  @ApiOkEnvelope(ProductResponseDto, { paginated: true })
  @ApiErrorEnvelopes(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
  )
  list(
    @Query() query: ListProductsQueryDto,
  ): Promise<PaginatedResult<ProductResponseDto>> {
    return this.productsService.list(query);
  }

  @Get(':id')
  @Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.User, UserRole.Agent)
  @ApiOperation({ summary: 'Get one product with its categories' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(ProductResponseDto)
  @ApiErrorEnvelopes(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ProductResponseDto> {
    return this.productsService.findOne(id);
  }

  @Post()
  @Roles(UserRole.SuperAdmin, UserRole.Admin)
  @ApiOperation({ summary: 'Create a product, optionally in categories' })
  @ApiOkEnvelope(ProductResponseDto, { status: HttpStatus.CREATED })
  @ApiErrorEnvelopes(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.CONFLICT,
  )
  create(
    @Body() dto: CreateProductDto,
    @CurrentActor() actor: RequestActor,
  ): Promise<ProductResponseDto> {
    return this.productsService.create(dto, actor);
  }

  @Patch(':id')
  @Roles(UserRole.SuperAdmin, UserRole.Admin)
  @ApiOperation({
    summary:
      'Update a product (categoryIds, when sent, replaces its categories)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(ProductResponseDto)
  @ApiErrorEnvelopes(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentActor() actor: RequestActor,
  ): Promise<ProductResponseDto> {
    return this.productsService.update(id, dto, actor);
  }

  @Delete(':id')
  @Roles(UserRole.SuperAdmin, UserRole.Admin)
  @ApiOperation({
    summary:
      'Delete a product (its category links are removed; categories stay)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(DeletedDto)
  @ApiErrorEnvelopes(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: RequestActor,
  ): Promise<DeletedDto> {
    return this.productsService.remove(id, actor);
  }
}
