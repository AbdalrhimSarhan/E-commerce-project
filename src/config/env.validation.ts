// Needed by class-transformer decorators. This file is also loaded outside Nest
// (TypeORM CLI, unit tests), where nothing else imports it first.
import 'reflect-metadata';
import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/**
 * Accepted values for TRUST_PROXY (passed to Express `trust proxy`):
 * - "true" / "false"
 * - a hop count, e.g. "1"
 * - a comma-separated list of IPs, CIDR subnets or the Express keywords
 *   loopback, linklocal, uniquelocal, e.g. "loopback, 10.0.0.0/8"
 */
const TRUST_PROXY_PATTERN =
  /^(true|false|\d+|[A-Za-z0-9.:/]+(\s*,\s*[A-Za-z0-9.:/]+)*)$/;

/** Turns "true"/"false" into a boolean; anything else is left as is so @IsBoolean rejects it. */
function toBoolean({ value }: { value: unknown }): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

/** Turns "a, b,,c" into ["a", "b", "c"]. */
function toList({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Every environment variable the app reads. Properties with an initializer are
 * optional (the initializer is the default); properties with `!` are required.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV!: NodeEnv;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  DB_HOST!: string;

  /**
   * Host port of the Docker Postgres (5432 is often taken by a local Postgres /
   * pgAdmin install). Inside the api container Compose sets 5432.
   */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  DB_PORT: number = 5433;

  @IsString()
  @IsNotEmpty()
  DB_USERNAME!: string;

  @IsString()
  @IsNotEmpty()
  DB_PASSWORD!: string;

  @IsString()
  @IsNotEmpty()
  DB_NAME!: string;

  @Transform(toBoolean)
  @IsBoolean()
  DB_LOGGING: boolean = false;

  @Transform(toList)
  @IsUrl(
    {
      require_tld: false,
      require_protocol: true,
      protocols: ['http', 'https'],
    },
    { each: true, message: 'each CORS_ORIGINS entry must be an http(s) URL' },
  )
  CORS_ORIGINS: string[] = [];

  @IsString()
  @Matches(TRUST_PROXY_PATTERN, {
    message:
      'TRUST_PROXY must be true, false, a hop count, or a comma-separated list of IPs/subnets',
  })
  TRUST_PROXY: string = 'false';

  /** bcrypt cost factor. Each +1 doubles the hashing time. */
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(15)
  BCRYPT_ROUNDS: number = 12;

  /** HMAC key for HS256 access tokens. At least 32 characters (256 bits). */
  @IsString()
  @MinLength(32)
  JWT_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_ISSUER: string = 'product-management-api';

  @IsString()
  @IsNotEmpty()
  JWT_AUDIENCE: string = 'product-management-clients';

  /** Access token lifetime in seconds. Default 15 minutes. */
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(86_400)
  JWT_ACCESS_TTL_SECONDS: number = 900;

  /** Refresh token (session) lifetime in seconds. Default 7 days. */
  @Type(() => Number)
  @IsInt()
  @Min(3_600)
  @Max(7_776_000)
  REFRESH_TOKEN_TTL_SECONDS: number = 604_800;

  /** Rate limit window for register, login and refresh, in seconds. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_AUTH_TTL_SECONDS: number = 60;

  /** Max requests per IP per window for register, login and refresh. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_AUTH_LIMIT: number = 10;
}

/**
 * Validates and types a raw environment against an env class. Throws one error
 * listing every invalid variable, so the process refuses to start.
 */
export function validateConfig<T extends object>(
  envClass: new () => T,
  config: Record<string, unknown>,
): T {
  const env = plainToInstance(envClass, config);
  const errors = validateSync(env, { skipMissingProperties: false });

  if (errors.length > 0) {
    const lines = errors.map((error) => {
      const reasons = Object.values(error.constraints ?? {}).join('; ');
      return `  - ${error.property}: ${reasons}`;
    });
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }

  return env;
}

/** Used by the app (ConfigModule) and the TypeORM CLI. */
export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  return validateConfig(EnvironmentVariables, config);
}

/** Converts the validated TRUST_PROXY string into the value Express expects. */
export function parseTrustProxy(value: string): boolean | number | string {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}
