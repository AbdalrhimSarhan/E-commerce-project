import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, In, Repository } from 'typeorm';
import { diffChanges, escapeLike } from '../../common/audit-diff';
import { ValidationException } from '../../common/exceptions/validation.exception';
import { PaginatedResult } from '../../common/pagination/paginated-result';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditResourceType } from '../audit/enums/audit.enums';
import type { RequestActor } from '../audit/request-actor';
import { Category } from '../categories/entities/category.entity';
import { ProductCategory } from '../categories/entities/product-category.entity';
import {
  CreateProductDto,
  ListProductsQueryDto,
  ProductResponseDto,
  UpdateProductDto,
} from './dto/product.dto';
import { Product } from './entities/product.entity';

/** Product fields recorded in the audit log. */
type ProductSnapshot = Record<string, unknown>;

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(ProductCategory)
    private readonly links: Repository<ProductCategory>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async list(
    query: ListProductsQueryDto,
  ): Promise<PaginatedResult<ProductResponseDto>> {
    const qb = this.products
      .createQueryBuilder('product')
      .orderBy(
        `product.${query.sortBy}`,
        query.sortOrder === 'asc' ? 'ASC' : 'DESC',
      )
      .addOrderBy('product.id', 'ASC') // stable order across pages
      .skip(query.offset)
      .take(query.limit);

    if (query.search) {
      qb.andWhere('(product.name ILIKE :search OR product.sku ILIKE :search)', {
        search: `%${escapeLike(query.search)}%`,
      });
    }
    if (query.isActive !== undefined) {
      qb.andWhere('product.isActive = :isActive', { isActive: query.isActive });
    }
    if (query.categoryId) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = product.id AND pc.category_id = :categoryId)',
        { categoryId: query.categoryId },
      );
    }

    const [items, total] = await qb.getManyAndCount();
    const categoriesByProduct = await this.loadCategories(
      this.links,
      items.map((product) => product.id),
    );

    return new PaginatedResult(
      items.map((product) =>
        toResponse(product, categoriesByProduct.get(product.id) ?? []),
      ),
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(id: string): Promise<ProductResponseDto> {
    return this.findOneWith(this.dataSource.manager, id);
  }

  create(
    dto: CreateProductDto,
    actor: RequestActor,
  ): Promise<ProductResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const categoryIds = dto.categoryIds ?? [];
      await assertCategoriesExist(manager, categoryIds);

      const product = await manager.getRepository(Product).save(
        manager.getRepository(Product).create({
          sku: dto.sku,
          name: dto.name,
          description: dto.description ?? null,
          price: dto.price,
          stock: dto.stock ?? 0,
          isActive: dto.isActive ?? true,
        }),
      );
      if (categoryIds.length > 0) {
        await manager.getRepository(ProductCategory).insert(
          categoryIds.map((categoryId) => ({
            productId: product.id,
            categoryId,
          })),
        );
      }

      const created = await this.findOneWith(manager, product.id);
      await this.audit.record(manager, {
        actor,
        action: AuditAction.ProductCreate,
        resourceType: AuditResourceType.Product,
        resourceId: product.id,
        changes: { after: snapshot(created) },
      });
      return created;
    });
  }

  update(
    id: string,
    dto: UpdateProductDto,
    actor: RequestActor,
  ): Promise<ProductResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const products = manager.getRepository(Product);
      // Row lock: concurrent updates of the same product run one after the other,
      // so the "before" values in the audit log are always right.
      const product = await products.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!product) {
        throw new NotFoundException('Product not found');
      }
      const before = snapshot(await this.findOneWith(manager, id));
      if (dto.categoryIds !== undefined) {
        await assertCategoriesExist(manager, dto.categoryIds);
      }

      if (dto.sku !== undefined) product.sku = dto.sku;
      if (dto.name !== undefined) product.name = dto.name;
      if (dto.description !== undefined) product.description = dto.description;
      if (dto.price !== undefined) product.price = dto.price;
      if (dto.stock !== undefined) product.stock = dto.stock;
      if (dto.isActive !== undefined) product.isActive = dto.isActive;
      await products.save(product);

      if (dto.categoryIds !== undefined) {
        await manager.getRepository(ProductCategory).delete({ productId: id });
        if (dto.categoryIds.length > 0) {
          await manager.getRepository(ProductCategory).insert(
            dto.categoryIds.map((categoryId) => ({
              productId: id,
              categoryId,
            })),
          );
        }
      }

      const updated = await this.findOneWith(manager, id);
      const changes = diffChanges(before, snapshot(updated));
      if (Object.keys(changes).length > 0) {
        await this.audit.record(manager, {
          actor,
          action: AuditAction.ProductUpdate,
          resourceType: AuditResourceType.Product,
          resourceId: id,
          changes,
        });
      }
      return updated;
    });
  }

  /** Deletes the product and its category links (CASCADE). Categories are not touched. */
  remove(id: string, actor: RequestActor): Promise<{ id: string }> {
    return this.dataSource.transaction(async (manager) => {
      const existing = await this.findOneWith(manager, id, true);
      await manager.getRepository(Product).delete({ id });
      await this.audit.record(manager, {
        actor,
        action: AuditAction.ProductDelete,
        resourceType: AuditResourceType.Product,
        resourceId: id,
        changes: { before: snapshot(existing) },
      });
      return { id };
    });
  }

  private async findOneWith(
    manager: EntityManager,
    id: string,
    lock = false,
  ): Promise<ProductResponseDto> {
    const product = await manager.getRepository(Product).findOne({
      where: { id },
      ...(lock && { lock: { mode: 'pessimistic_write' as const } }),
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const categories = await this.loadCategories(
      manager.getRepository(ProductCategory),
      [id],
    );
    return toResponse(product, categories.get(id) ?? []);
  }

  /** Categories of many products in one query, sorted by name. */
  private async loadCategories(
    links: Repository<ProductCategory>,
    productIds: string[],
  ): Promise<Map<string, Category[]>> {
    const result = new Map<string, Category[]>();
    if (productIds.length === 0) {
      return result;
    }
    const rows = await links.find({
      where: { productId: In(productIds) },
      relations: { category: true },
      order: { category: { name: 'ASC' } },
    });
    for (const row of rows) {
      const list = result.get(row.productId) ?? [];
      list.push(row.category);
      result.set(row.productId, list);
    }
    return result;
  }
}

/** 400 with details when any id is unknown; nothing is written in that case. */
async function assertCategoriesExist(
  manager: EntityManager,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const found = await manager
    .getRepository(Category)
    .find({ select: { id: true }, where: { id: In(ids) } });
  const known = new Set(found.map((category) => category.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new ValidationException([
      {
        field: 'categoryIds',
        message: `unknown category id(s): ${unknown.join(', ')}`,
      },
    ]);
  }
}

function toResponse(
  product: Product,
  categories: Category[],
): ProductResponseDto {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    price: product.price,
    stock: product.stock,
    isActive: product.isActive,
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
    })),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function snapshot(product: ProductResponseDto): ProductSnapshot {
  return {
    sku: product.sku,
    name: product.name,
    description: product.description,
    price: product.price,
    stock: product.stock,
    isActive: product.isActive,
    categoryIds: product.categories.map((category) => category.id).sort(),
  };
}
