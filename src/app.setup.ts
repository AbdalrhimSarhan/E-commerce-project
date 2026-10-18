import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { REQUEST_ID_HEADER } from './common/constants/request-id';
import {
  flattenValidationErrors,
  ValidationException,
} from './common/exceptions/validation.exception';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { apiPrefixOnly } from './common/middleware/api-prefix-only.middleware';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { setupSwagger } from './common/swagger/setup-swagger';
import {
  type EnvironmentVariables,
  parseTrustProxy,
} from './config/env.validation';

export const API_PREFIX = 'api';

/**
 * Everything that configures the HTTP app. Kept outside main.ts so the e2e
 * tests can build exactly the same app.
 */
export function setupApp(app: NestExpressApplication): void {
  const config =
    app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  // Must be first: every later middleware, log line and error has a request id.
  app.use(requestIdMiddleware);

  // So req.ip is the real client IP behind Docker / reverse proxies.
  app.set(
    'trust proxy',
    parseTrustProxy(config.get('TRUST_PROXY', { infer: true })),
  );

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // The API is served over plain HTTP in Docker; this directive would make
          // browsers load the Swagger UI assets over HTTPS and break /api/docs.
          upgradeInsecureRequests: null,
        },
      },
    }),
  );

  const corsOrigins = config.get('CORS_ORIGINS', { infer: true });
  if (corsOrigins.length > 0) {
    app.enableCors({
      origin: corsOrigins,
      exposedHeaders: [REQUEST_ID_HEADER],
    });
  }

  app.setGlobalPrefix(API_PREFIX);
  app.use(apiPrefixOnly(API_PREFIX));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new ValidationException(flattenValidationErrors(errors)),
    }),
  );
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  setupSwagger(app);
}
