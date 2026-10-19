import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { parseApiKey } from '../../../common/crypto/api-key';
import { UserRole } from '../../users/enums/user-role.enum';
import { ApiKey } from '../entities/api-key.entity';
import { Session } from '../entities/session.entity';
import type { AuthPrincipal } from '../types/auth-principal';
import { TokenService } from './token.service';

/** api_keys.last_used_at is written at most once per this interval per key. */
const API_KEY_TOUCH_INTERVAL = '5 minutes';

/** One message for every failed check, so a caller cannot tell which check failed. */
export const INVALID_CREDENTIALS_MESSAGE = 'Invalid or expired credentials';

/**
 * Answers "who are you?" for a bearer token or an API key. Every failure
 * throws the same 401; the real reason is only logged at debug level.
 */
@Injectable()
export class PrincipalResolver {
  private readonly logger = new Logger(PrincipalResolver.name);

  constructor(
    private readonly tokens: TokenService,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    @InjectRepository(ApiKey) private readonly apiKeys: Repository<ApiKey>,
  ) {}

  async fromAccessToken(token: string): Promise<AuthPrincipal> {
    const claims = await this.tokens.verifyAccessToken(token);
    if (!claims) {
      return this.reject('access token failed verification');
    }

    const session = await this.sessions.findOne({
      where: { id: claims.sid },
      relations: { user: true },
    });
    if (!session || session.userId !== claims.sub) {
      return this.reject('session not found for token');
    }
    if (session.revokedAt !== null) {
      return this.reject('session revoked');
    }
    if (session.expiresAt <= new Date()) {
      return this.reject('session expired');
    }
    if (!session.user.isActive) {
      return this.reject('user inactive');
    }

    const { user } = session;
    return {
      id: user.id,
      email: user.email,
      // From the database, not from the token.
      role: user.role,
      actorType: user.role === UserRole.Agent ? 'agent' : 'user',
      authMethod: 'jwt',
      sessionId: session.id,
    };
  }

  async fromApiKey(rawKey: string): Promise<AuthPrincipal> {
    const parsed = parseApiKey(rawKey);
    if (!parsed) {
      return this.reject('malformed api key'); // no database query for garbage
    }

    const apiKey = await this.apiKeys.findOne({
      where: { keyHash: parsed.keyHash },
      relations: { user: true },
    });
    if (!apiKey) {
      return this.reject('api key not found');
    }
    if (apiKey.revokedAt !== null) {
      return this.reject('api key revoked');
    }
    if (apiKey.expiresAt !== null && apiKey.expiresAt <= new Date()) {
      return this.reject('api key expired');
    }
    if (!apiKey.user.isActive) {
      return this.reject('api key user inactive');
    }
    if (apiKey.user.role !== UserRole.Agent) {
      return this.reject('api key user is not an agent');
    }

    await this.touchApiKey(apiKey.id);

    return {
      id: apiKey.user.id,
      email: apiKey.user.email,
      role: apiKey.user.role,
      actorType: 'agent',
      authMethod: 'api_key',
      apiKeyId: apiKey.id,
    };
  }

  /**
   * One conditional UPDATE: it only writes if the last write is older than the
   * interval, so busy agents do not cause a write per request, and two
   * concurrent requests cannot both write.
   */
  private async touchApiKey(apiKeyId: string): Promise<void> {
    await this.apiKeys
      .createQueryBuilder()
      .update(ApiKey)
      .set({ lastUsedAt: () => 'now()' })
      .where('id = :id', { id: apiKeyId })
      .andWhere(
        `(last_used_at IS NULL OR last_used_at < now() - interval '${API_KEY_TOUCH_INTERVAL}')`,
      )
      .execute();
  }

  private reject(reason: string): never {
    this.logger.debug(`Authentication rejected: ${reason}`);
    throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
  }
}
