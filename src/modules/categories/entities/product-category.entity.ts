import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { Category } from './category.entity';

/**
 * The many-to-many link between products and categories, as an explicit entity
 * (instead of @ManyToMany) so constraint names and `created_at` are under our
 * control. Deleting a product or a category deletes its links (CASCADE); the
 * other side is never touched.
 */
@Entity({ name: 'product_categories' })
// The PK (product_id, category_id) already serves lookups by product;
// this index serves lookups by category.
@Index('IDX_product_categories_category_id', ['categoryId'])
export class ProductCategory {
  @PrimaryColumn('uuid', {
    name: 'product_id',
    primaryKeyConstraintName: 'PK_product_categories',
  })
  productId!: string;

  @PrimaryColumn('uuid', {
    name: 'category_id',
    primaryKeyConstraintName: 'PK_product_categories',
  })
  categoryId!: string;

  @ManyToOne(() => Product, (product) => product.categoryLinks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'product_id',
    foreignKeyConstraintName: 'FK_product_categories_product_id',
  })
  product!: Relation<Product>;

  @ManyToOne(() => Category, (category) => category.productLinks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'category_id',
    foreignKeyConstraintName: 'FK_product_categories_category_id',
  })
  category!: Relation<Category>;

  /** When the product was put into the category. */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
