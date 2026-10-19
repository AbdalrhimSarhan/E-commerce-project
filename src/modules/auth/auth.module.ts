import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { EnvironmentVariables } from '../../config/env.validation';
import { AuditModule } from '../audit/audit.module';
import { User } from '../users/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ApiKey } from './entities/api-key.entity';
import { Session } from './entities/session.entity';
import { AuthenticatedGuard } from './guards/authenticated.guard';
import { RolesGuard } from './guards/roles.guard';
import { AuthenticationMiddleware } from './middleware/authentication.middleware';
import { PrincipalResolver } from './services/principal-resolver.service';
import { TokenService } from './services/token.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Session, ApiKey]),
    AuditModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
    // Only used by routes with @UseGuards(ThrottlerGuard): register, login, refresh.
    // In-memory storage: correct for a single API instance.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        throttlers: [
          {
            name: 'auth',
            ttl:
              config.get('THROTTLE_AUTH_TTL_SECONDS', { infer: true }) * 1000,
            limit: config.get('THROTTLE_AUTH_LIMIT', { infer: true }),
          },
        ],
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    PrincipalResolver,
    // Global guards run in registration order: authenticated first, then roles.
    { provide: APP_GUARD, useClass: AuthenticatedGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(AuthenticationMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
