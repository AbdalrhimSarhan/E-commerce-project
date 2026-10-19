import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { Product } from '../products/entities/product.entity';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { Category } from './entities/category.entity';
import { ProductCategory } from './entities/product-category.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Category, Product, ProductCategory]),
    AuditModule,
  ],
  controllers: [CategoriesController],
  providers: [CategoriesService],
})
export class CategoriesModule {}
