import { type DynamicModule, Module, type Type } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthzDemoModule } from './modules/authz-demo/authz-demo.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { HealthModule } from './modules/health/health.module';
import { ProductsModule } from './modules/products/products.module';
import { UsersModule } from './modules/users/users.module';

/** Development-only modules. The e2e tests import AuthzDemoModule explicitly. */
const devOnlyModules: Array<Type | DynamicModule> =
  process.env.NODE_ENV === 'development' ? [AuthzDemoModule] : [];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      // Tests get their environment from .env.test (node --env-file), never from .env.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    DatabaseModule,
    HealthModule,
    AuditModule,
    UsersModule,
    AuthModule,
    ProductsModule,
    CategoriesModule,
    ...devOnlyModules,
  ],
})
export class AppModule {}
