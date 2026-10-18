import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Security scheme names. Use them with @ApiBearerAuth('bearer') / @ApiSecurity('apiKey'). */
export const BEARER_AUTH = 'bearer';
export const API_KEY_AUTH = 'apiKey';
export const API_KEY_HEADER = 'X-API-Key';

/** Serves the OpenAPI UI at /api/docs and the JSON at /api/docs-json. */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Product Management API')
    .setDescription(
      'Every response uses the envelope `{ success, data | error, meta }`. ' +
        'Humans authenticate with a JWT (bearer); AI agents with an API key (X-API-Key).',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      BEARER_AUTH,
    )
    .addApiKey(
      { type: 'apiKey', in: 'header', name: API_KEY_HEADER },
      API_KEY_AUTH,
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
