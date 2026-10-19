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
  Put,
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
import {
  ApiErrorEnvelopes,
  ApiOkEnvelope,
} from '../../common/swagger/api-envelope.decorators';
import { DeletedDto } from '../../common/swagger/deleted.dto';
import { API_KEY_AUTH, BEARER_AUTH } from '../../common/swagger/setup-swagger';
import type { RequestActor } from '../audit/request-actor';
import { CurrentActor, Roles } from '../auth/decorators/auth.decorators';
import { UserRole } from '../users/enums/user-role.enum';
import { CategoriesService } from './categories.service';
import {
  CategoryDetailDto,
  CategoryProductIdsDto,
  CategoryResponseDto,
  CreateCategoryDto,
  ListCategoriesQueryDto,
  UpdateCategoryDto,
} from './dto/category.dto';

/** Everyone authenticated can read. super_admin, admin and agents can modify categories and their product links. */
@ApiTags('categories')
@ApiBearerAuth(BEARER_AUTH)
@ApiSecurity(API_KEY_AUTH)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.User, UserRole.Agent)
  @ApiOperation({ summary: 'List categories with product counts (paginated)' })
  @ApiOkEnvelope(CategoryResponseDto, { paginated: true })
  @ApiErrorEnvelopes(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
  )
  list(
    @Query() query: ListCategoriesQueryDto,
  ): Promise<PaginatedResult<CategoryResponseDto>> {
    return this.categoriesService.list(query);
  }

  @Get(':id')
  @Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.User, UserRole.Agent)
  @ApiOperation({ summary: 'Get one category with its products' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(CategoryDetailDto)
  @ApiErrorEnvelopes(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CategoryDetailDto> {
    return this.categoriesService.findOne(id);
  }

  @Post()
  @Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Agent)
  @ApiOperation({ summary: 'Create a category, optionally with products' })
  @ApiOkEnvelope(CategoryDetailDto, { status: HttpStatus.CREATED })
  @ApiErrorEnvelopes(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.CONFLICT,
  )
  create(
    @Body() dto: CreateCategoryDto,
    @CurrentActor() actor: RequestActor,
  ): Promise<CategoryDetailDto> {
    return this.categoriesService.create(dto, actor);
  }

  @Patch(':id')
  @Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Agent)
  @ApiOperation({ summary: 'Rename a category or change its description' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(CategoryDetailDto)
  @ApiErrorEnvelopes(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentActor() actor: RequestActor,
  ): Promise<CategoryDetailDto> {
    return this.categoriesService.update(id, dto, actor);
  }

  @Delete(':id')
  @Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Agent)
  @ApiOperation({
    summary: 'Delete a category (product links are removed; products stay)',
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
    return this.categoriesService.remove(id, actor);
  }

  @Post(':id/products')
  @Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Agent)
  @ApiOperation({
    summary: 'Add products to the category (already linked ones are skipped)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(CategoryDetailDto)
  @ApiErrorEnvelopes(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  addProducts(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CategoryProductIdsDto,
    @CurrentActor() actor: RequestActor,
  ): Promise<CategoryDetailDto> {
    return this.categoriesService.addProducts(id, dto.productIds, actor);
  }

  @Put(':id/products')
  @Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Agent)
  @ApiOperation({
    summary: 'Replace the products of the category with exactly this list',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(CategoryDetailDto)
  @ApiErrorEnvelopes(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  replaceProducts(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CategoryProductIdsDto,
    @CurrentActor() actor: RequestActor,
  ): Promise<CategoryDetailDto> {
    return this.categoriesService.replaceProducts(id, dto.productIds, actor);
  }

  @Delete(':id/products/:productId')
  @Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Agent)
  @ApiOperation({ summary: 'Remove one product from the category' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiOkEnvelope(CategoryDetailDto)
  @ApiErrorEnvelopes(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  removeProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentActor() actor: RequestActor,
  ): Promise<CategoryDetailDto> {
    return this.categoriesService.removeProduct(id, productId, actor);
  }
}
