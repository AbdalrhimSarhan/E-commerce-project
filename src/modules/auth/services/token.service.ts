import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import type { EnvironmentVariables } from '../../../config/env.validation';
import type { UserRole } from '../../users/enums/user-role.enum';

/** The claims we put into (and require from) an access token. */
export interface AccessTokenClaims {
  /** user id */
  sub: string;
  /** session id */
  sid: string;
  /** informational only: authorization always uses the role from the database */
  role: UserRole;
}

/** Signs and verifies access tokens (HS256 JWT). */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  get accessTokenTtlSeconds(): number {
    return this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
  }

  signAccessToken(claims: AccessTokenClaims): Promise<string> {
    return this.jwt.signAsync(
      { sid: claims.sid, role: claims.role },
      {
        subject: claims.sub,
        algorithm: 'HS256',
        issuer: this.config.get('JWT_ISSUER', { infer: true }),
        audience: this.config.get('JWT_AUDIENCE', { infer: true }),
        expiresIn: this.accessTokenTtlSeconds,
      },
    );
  }

  /**
   * Verifies signature, algorithm (HS256 only, so "alg: none" or RS/HS
   * confusion is rejected), expiry, issuer and audience. Returns null for any
   * invalid token; the caller answers with a generic 401.
   */
  async verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
    let payload: Record<string, unknown>;
    try {
      payload = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        algorithms: ['HS256'],
        issuer: this.config.get('JWT_ISSUER', { infer: true }),
        audience: this.config.get('JWT_AUDIENCE', { infer: true }),
      });
    } catch {
      return null;
    }

    const { sub, sid, role } = payload;
    if (
      typeof sub !== 'string' ||
      !isUUID(sub) ||
      typeof sid !== 'string' ||
      !isUUID(sid)
    ) {
      return null;
    }
    return { sub, sid, role: role as UserRole };
  }
}
