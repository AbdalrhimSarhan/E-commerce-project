import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ProductCategory } from '../../categories/entities/product-category.entity';

@Entity({ name: 'products' })
@Unique('UQ_products_sku', ['sku'])
// SKUs are stored uppercase, e.g. "KB-001".
@Check('CHK_products_sku_format', `"sku" ~ '^[A-Z0-9][A-Z0-9-]{0,63}$'`)
@Check('CHK_products_name_not_blank', `char_length(btrim("name")) > 0`)
@Check('CHK_products_description_length', `char_length("description") <= 5000`)
@Check('CHK_products_price_non_negative', `"price" >= 0`)
@Check('CHK_products_stock_non_negative', `"stock" >= 0`)
export class Product {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_products' })
  id!: string;

  /** Stock keeping unit: the business key a human or agent uses to identify a product. */
  @Column({ name: 'sku', type: 'varchar', length: 64 })
  sku!: string;

  @Column({ name: 'name', type: 'varchar', length: 200 })
  name!: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null;

  /**
   * numeric(12,2): exact money arithmetic. The pg driver returns numeric as a
   * string ("19.90"), and we keep it a string end to end to avoid float errors.
   */
  @Column({ name: 'price', type: 'numeric', precision: 12, scale: 2 })
  price!: string;

  @Column({ name: 'stock', type: 'integer', default: 0 })
  stock!: number;

  /** Inactive products stay in the catalog (and in category links) but are hidden from sale. */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => ProductCategory, (link) => link.product)
  categoryLinks!: Relation<ProductCategory[]>;
}
