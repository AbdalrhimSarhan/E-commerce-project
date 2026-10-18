import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { setupApp } from './app.setup';
import { AppLogger } from './common/logger/app-logger';
import type { EnvironmentVariables } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new AppLogger(),
    // Throw instead of process.abort(), so the error is printed and we exit with code 1.
    abortOnError: false,
  });

  setupApp(app);

  // On SIGTERM/SIGINT (e.g. `docker stop`), Nest closes the HTTP server and the DB pool.
  app.enableShutdownHooks();

  const config =
    app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  const port = config.get('PORT', { infer: true });
  await app.listen(port);

  new Logger('Bootstrap').log(
    `API listening on port ${port}, docs at /api/docs`,
  );
}

bootstrap().catch((error: unknown) => {
  // A failed start (invalid env, database unreachable, ...) must stop the process.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
