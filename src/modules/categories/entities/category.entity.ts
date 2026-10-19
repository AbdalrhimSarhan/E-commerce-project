import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { ProductCategory } from './product-category.entity';

@Entity({ name: 'categories' })
// Case-insensitive unique name: a unique index on lower(name). TypeORM cannot
// describe an expression index, so it is created by hand in the migration and
// marked synchronize: false here so migration:generate leaves it alone.
@Index('UQ_categories_name_lower', { synchronize: false })
@Check('CHK_categories_name_not_blank', `char_length(btrim("name")) > 0`)
@Check(
  'CHK_categories_description_length',
  `char_length("description") <= 2000`,
)
export class Category {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_categories' })
  id!: string;

  @Column({ name: 'name', type: 'varchar', length: 100 })
  name!: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => ProductCategory, (link) => link.category)
  productLinks!: Relation<ProductCategory[]>;
}
