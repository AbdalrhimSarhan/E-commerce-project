import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { API_KEY_PATTERN } from '../../common/crypto/api-key';
import { validateConfig } from '../../config/env.validation';
import {
  PASSWORD_PATTERN,
  PASSWORD_RULE_MESSAGE,
} from '../../modules/users/constants/password-policy';
import { normalizeEmail } from '../../modules/users/utils/normalize-email';

function toNormalizedEmail({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? normalizeEmail(value) : value;
}

/** Turns an empty string into undefined, so `SEED_AGENT_API_KEY=` means "not set". */
function emptyToUndefined({ value }: { value: unknown }): unknown {
  return value === '' ? undefined : value;
}

// "password must be ..." becomes "SEED_USER_PASSWORD must be ...".
const passwordRule = {
  message: (args: { property: string }) =>
    PASSWORD_RULE_MESSAGE.replace(/^password/, args.property),
};

/**
 * Variables read only by the seed script. Kept apart from EnvironmentVariables
 * so the app itself never requires them.
 */
export class SeedEnvironmentVariables {
  @Transform(toNormalizedEmail)
  @IsEmail()
  SEED_SUPER_ADMIN_EMAIL!: string;

  @IsString()
  @Matches(PASSWORD_PATTERN, passwordRule)
  SEED_SUPER_ADMIN_PASSWORD!: string;

  @Transform(toNormalizedEmail)
  @IsEmail()
  SEED_ADMIN_EMAIL!: string;

  @IsString()
  @Matches(PASSWORD_PATTERN, passwordRule)
  SEED_ADMIN_PASSWORD!: string;

  @Transform(toNormalizedEmail)
  @IsEmail()
  SEED_USER_EMAIL!: string;

  @IsString()
  @Matches(PASSWORD_PATTERN, passwordRule)
  SEED_USER_PASSWORD!: string;

  @Transform(toNormalizedEmail)
  @IsEmail()
  SEED_AGENT_EMAIL!: string;

  /** Optional fixed agent key for local development (same format as generated keys). */
  @Transform(emptyToUndefined)
  @IsOptional()
  @Matches(API_KEY_PATTERN, {
    message:
      'SEED_AGENT_API_KEY must match pmk_<8 lowercase hex>_<43 base64url chars>',
  })
  SEED_AGENT_API_KEY?: string;

  /**
   * Also enables the demo catalog (20 products, 8 categories), which is only
   * created while the products table is empty. Same strict rule as the
   * container entrypoint: "true" or "false" only.
   */
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'SEED_ON_STARTUP must be true or false' })
  SEED_ON_STARTUP: boolean = false;
}

export function validateSeedEnv(
  config: Record<string, unknown>,
): SeedEnvironmentVariables {
  const env = validateConfig(SeedEnvironmentVariables, config);

  const emails = [
    env.SEED_SUPER_ADMIN_EMAIL,
    env.SEED_ADMIN_EMAIL,
    env.SEED_USER_EMAIL,
    env.SEED_AGENT_EMAIL,
  ];
  if (new Set(emails).size !== emails.length) {
    throw new Error(
      'Invalid environment configuration:\n  - SEED_*_EMAIL: the four seed emails must be different',
    );
  }

  return env;
}
