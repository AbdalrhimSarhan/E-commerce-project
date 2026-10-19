import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, In, Repository } from 'typeorm';
import { diffChanges, escapeLike } from '../../common/audit-diff';
import { ValidationException } from '../../common/exceptions/validation.exception';
import { PaginatedResult } from '../../common/pagination/paginated-result';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditResourceType } from '../audit/enums/audit.enums';
import type { RequestActor } from '../audit/request-actor';
import { Product } from '../products/entities/product.entity';
import {
  CategoryDetailDto,
  CategoryResponseDto,
  CreateCategoryDto,
  ListCategoriesQueryDto,
  UpdateCategoryDto,
} from './dto/category.dto';
import { Category } from './entities/category.entity';
import { ProductCategory } from './entities/product-category.entity';

/** A Category loaded with `productCount` (see loadRelationCountAndMap). */
type CategoryWithCount = Category & { productCount: number };

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async list(
    query: ListCategoriesQueryDto,
  ): Promise<PaginatedResult<CategoryResponseDto>> {
    const qb = this.categories
      .createQueryBuilder('category')
      .loadRelationCountAndMap('category.productCount', 'category.productLinks')
      .orderBy('category.name', 'ASC')
      .addOrderBy('category.id', 'ASC')
      .skip(query.offset)
      .take(query.limit);

    if (query.search) {
      qb.andWhere('category.name ILIKE :search', {
        search: `%${escapeLike(query.search)}%`,
      });
    }

    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResult(
      (items as CategoryWithCount[]).map((category) =>
        toResponse(category, category.productCount),
      ),
      total,
      query.page,
      query.limit,
    );
  }

  findOne(id: string): Promise<CategoryDetailDto> {
    return this.findDetail(this.dataSource.manager, id);
  }

  create(
    dto: CreateCategoryDto,
    actor: RequestActor,
  ): Promise<CategoryDetailDto> {
    return this.dataSource.transaction(async (manager) => {
      const productIds = dto.productIds ?? [];
      await assertProductsExist(manager, productIds);

      const category = await manager.getRepository(Category).save(
        manager.getRepository(Category).create({
          name: dto.name,
          description: dto.description ?? null,
        }),
      );
      if (productIds.length > 0) {
        await manager.getRepository(ProductCategory).insert(
          productIds.map((productId) => ({
            productId,
            categoryId: category.id,
          })),
        );
      }

      const created = await this.findDetail(manager, category.id);
      await this.audit.record(manager, {
        actor,
        action: AuditAction.CategoryCreate,
        resourceType: AuditResourceType.Category,
        resourceId: category.id,
        changes: { after: snapshot(created) },
      });
      return created;
    });
  }

  update(
    id: string,
    dto: UpdateCategoryDto,
    actor: RequestActor,
  ): Promise<CategoryDetailDto> {
    return this.dataSource.transaction(async (manager) => {
      const category = await lockCategory(manager, id);
      const before = { name: category.name, description: category.description };

      if (dto.name !== undefined) category.name = dto.name;
      if (dto.description !== undefined) category.description = dto.description;
      await manager.getRepository(Category).save(category);

      const changes = diffChanges(before, {
        name: category.name,
        description: category.description,
      });
      if (Object.keys(changes).length > 0) {
        await this.audit.record(manager, {
          actor,
          action: AuditAction.CategoryUpdate,
          resourceType: AuditResourceType.Category,
          resourceId: id,
          changes,
        });
      }
      return this.findDetail(manager, id);
    });
  }

  /** Deletes the category and its product links (CASCADE). The products themselves stay. */
  remove(id: string, actor: RequestActor): Promise<{ id: string }> {
    return this.dataSource.transaction(async (manager) => {
      await lockCategory(manager, id);
      const existing = await this.findDetail(manager, id);
      await manager.getRepository(Category).delete({ id });
      await this.audit.record(manager, {
        actor,
        action: AuditAction.CategoryDelete,
        resourceType: AuditResourceType.Category,
        resourceId: id,
        changes: { before: snapshot(existing) },
      });
      return { id };
    });
  }

  /** Adds products to the category. Products already in it are skipped (idempotent). */
  addProducts(
    id: string,
    productIds: string[],
    actor: RequestActor,
  ): Promise<CategoryDetailDto> {
    return this.dataSource.transaction(async (manager) => {
      await lockCategory(manager, id);
      await assertProductsExist(manager, productIds);

      const current = await linkedProductIds(manager, id);
      const added = productIds.filter((productId) => !current.has(productId));
      if (added.length > 0) {
        await manager
          .getRepository(ProductCategory)
          .insert(added.map((productId) => ({ productId, categoryId: id })));
        await this.audit.record(manager, {
          actor,
          action: AuditAction.CategoryProductsAdd,
          resourceType: AuditResourceType.Category,
          resourceId: id,
          changes: { added: added.sort() },
        });
      }
      return this.findDetail(manager, id);
    });
  }

  /** Removes one product from the category. 404 if the product is not in it. */
  removeProduct(
    id: string,
    productId: string,
    actor: RequestActor,
  ): Promise<CategoryDetailDto> {
    return this.dataSource.transaction(async (manager) => {
      await lockCategory(manager, id);
      const result = await manager
        .getRepository(ProductCategory)
        .delete({ categoryId: id, productId });
      if (!result.affected) {
        throw new NotFoundException('The product is not in this category');
      }
      await this.audit.record(manager, {
        actor,
        action: AuditAction.CategoryProductsRemove,
        resourceType: AuditResourceType.Category,
        resourceId: id,
        changes: { removed: [productId] },
      });
      return this.findDetail(manager, id);
    });
  }

  /** Makes the category contain exactly these products. */
  replaceProducts(
    id: string,
    productIds: string[],
    actor: RequestActor,
  ): Promise<CategoryDetailDto> {
    return this.dataSource.transaction(async (manager) => {
      await lockCategory(manager, id);
      await assertProductsExist(manager, productIds);

      const current = await linkedProductIds(manager, id);
      const wanted = new Set(productIds);
      const added = productIds.filter((productId) => !current.has(productId));
      const removed = [...current].filter(
        (productId) => !wanted.has(productId),
      );
      const links = manager.getRepository(ProductCategory);

      if (removed.length > 0) {
        await links.delete({ categoryId: id, productId: In(removed) });
      }
      if (added.length > 0) {
        await links.insert(
          added.map((productId) => ({ productId, categoryId: id })),
        );
      }
      if (added.length > 0 || removed.length > 0) {
        await this.audit.record(manager, {
          actor,
          action: AuditAction.CategoryProductsReplace,
          resourceType: AuditResourceType.Category,
          resourceId: id,
          changes: { added: added.sort(), removed: removed.sort() },
        });
      }
      return this.findDetail(manager, id);
    });
  }

  private async findDetail(
    manager: EntityManager,
    id: string,
  ): Promise<CategoryDetailDto> {
    const category = await manager.getRepository(Category).findOneBy({ id });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    const links = await manager.getRepository(ProductCategory).find({
      where: { categoryId: id },
      relations: { product: true },
      order: { product: { name: 'ASC' } },
    });
    return {
      ...toResponse(category, links.length),
      products: links.map(({ product }) => ({
        id: product.id,
        sku: product.sku,
        name: product.name,
        price: product.price,
        isActive: product.isActive,
      })),
    };
  }
}

/**
 * Loads the category with a row lock. Link changes on the same category then
 * run one after the other, so "added/removed" in the audit log is exact.
 */
async function lockCategory(
  manager: EntityManager,
  id: string,
): Promise<Category> {
  const category = await manager
    .getRepository(Category)
    .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
  if (!category) {
    throw new NotFoundException('Category not found');
  }
  return category;
}

async function linkedProductIds(
  manager: EntityManager,
  categoryId: string,
): Promise<Set<string>> {
  const rows = await manager
    .getRepository(ProductCategory)
    .find({ select: { productId: true }, where: { categoryId } });
  return new Set(rows.map((row) => row.productId));
}

/** 400 with details when any id is unknown; nothing is written in that case. */
async function assertProductsExist(
  manager: EntityManager,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const found = await manager
    .getRepository(Product)
    .find({ select: { id: true }, where: { id: In(ids) } });
  const known = new Set(found.map((product) => product.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new ValidationException([
      {
        field: 'productIds',
        message: `unknown product id(s): ${unknown.join(', ')}`,
      },
    ]);
  }
}

function toResponse(
  category: Category,
  productCount: number,
): CategoryResponseDto {
  return {
    id: category.id,
    name: category.name,
    description: category.description,
    productCount,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

function snapshot(category: CategoryDetailDto): Record<string, unknown> {
  return {
    name: category.name,
    description: category.description,
    productIds: category.products.map((product) => product.id).sort(),
  };
}
