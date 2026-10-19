import { randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, IsNull, Repository } from 'typeorm';
import { hashesEqual } from '../../common/crypto/hashing';
import type { EnvironmentVariables } from '../../config/env.validation';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditResourceType } from '../audit/enums/audit.enums';
import type { RequestActor } from '../audit/request-actor';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { AuthTokensDto, LoginDto, RegisterDto } from './dto/auth.dto';
import { MeDto } from './dto/me.dto';
import { Session } from './entities/session.entity';
import { issueRefreshToken, parseRefreshToken } from './refresh-token';
import { INVALID_CREDENTIALS_MESSAGE } from './services/principal-resolver.service';
import { TokenService } from './services/token.service';
import type { AuthPrincipal } from './types/auth-principal';

const LOGIN_FAILED_MESSAGE = 'Invalid credentials';
const USER_AGENT_MAX_LENGTH = 512;

/** Where a login comes from; stored on the session. */
export interface ClientInfo {
  userAgent: string | null;
  ipAddress: string | null;
}

/** Outcome of the refresh transaction. Reuse is reported AFTER the commit, so the revoke sticks. */
type RefreshOutcome =
  | { kind: 'rotated'; tokens: AuthTokensDto }
  | { kind: 'rejected' }
  | { kind: 'reuse_detected' };

@Injectable()
export class AuthService implements OnModuleInit {
  /** bcrypt hash of a random value; compared against when the email is unknown (timing). */
  private dummyPasswordHash = '';

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    // Same cost factor as real hashes, so "unknown email" takes as long as "wrong password".
    this.dummyPasswordHash = await bcrypt.hash(randomUUID(), this.bcryptRounds);
  }

  /** Creates a user with role 'user'. A duplicate email fails on the unique constraint (409). */
  async register(
    dto: RegisterDto,
    actor: RequestActor,
  ): Promise<UserResponseDto> {
    const passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds);

    const user = await this.dataSource.transaction(async (manager) => {
      const created = await manager.getRepository(User).save(
        manager.getRepository(User).create({
          email: dto.email,
          name: dto.name,
          passwordHash,
          role: UserRole.User,
          isActive: true,
        }),
      );
      await this.audit.record(manager, {
        actor,
        actorIdOverride: created.id,
        action: AuditAction.AuthRegister,
        resourceType: AuditResourceType.User,
        resourceId: created.id,
        changes: {
          email: created.email,
          name: created.name,
          role: created.role,
        },
      });
      return created;
    });

    return UserResponseDto.from(user);
  }

  /**
   * Same 401 "Invalid credentials" for: unknown email, wrong password,
   * inactive user, agent account. bcrypt.compare always runs once.
   */
  async login(
    dto: LoginDto,
    client: ClientInfo,
    actor: RequestActor,
  ): Promise<AuthTokensDto> {
    const user = await this.users.findOneBy({ email: dto.email });

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? this.dummyPasswordHash,
    );

    if (
      !user ||
      !passwordMatches ||
      !user.isActive ||
      user.role === UserRole.Agent
    ) {
      throw new UnauthorizedException(LOGIN_FAILED_MESSAGE);
    }

    const sessionId = randomUUID();
    const refresh = issueRefreshToken(sessionId);

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Session).insert({
        id: sessionId,
        userId: user.id,
        refreshTokenHash: refresh.secretHash,
        userAgent: client.userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
        ipAddress: client.ipAddress,
        expiresAt: new Date(Date.now() + this.refreshTtlSeconds * 1000),
      });
      await this.audit.record(manager, {
        actor: { ...actor, principal: this.principalFor(user, sessionId) },
        action: AuditAction.AuthLogin,
        resourceType: AuditResourceType.Session,
        resourceId: sessionId,
      });
    });

    return this.buildTokens(user, sessionId, refresh.token);
  }

  /**
   * Rotates the refresh token. The session row is locked (SELECT ... FOR UPDATE)
   * for the whole check-and-update, so two parallel refreshes cannot both win:
   * the second one waits, then sees a hash that no longer matches.
   */
  async refresh(
    refreshToken: string,
    actor: RequestActor,
  ): Promise<AuthTokensDto> {
    const parsed = parseRefreshToken(refreshToken);
    if (!parsed) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const outcome = await this.dataSource.transaction(
      async (manager): Promise<RefreshOutcome> => {
        const sessions = manager.getRepository(Session);
        const session = await sessions.findOne({
          where: { id: parsed.sessionId },
          lock: { mode: 'pessimistic_write' },
        });

        if (
          !session ||
          session.revokedAt !== null ||
          session.expiresAt <= new Date()
        ) {
          return { kind: 'rejected' };
        }

        if (!hashesEqual(session.refreshTokenHash, parsed.secretHash)) {
          // A valid session but an old secret: the token was used twice. Assume it
          // was stolen and end the session for everyone holding it.
          session.revokedAt = new Date();
          await sessions.save(session);
          const user = await manager
            .getRepository(User)
            .findOneByOrFail({ id: session.userId });
          await this.audit.record(manager, {
            actor: { ...actor, principal: this.principalFor(user, session.id) },
            action: AuditAction.AuthRefreshReuseDetected,
            resourceType: AuditResourceType.Session,
            resourceId: session.id,
            changes: { revokedAt: session.revokedAt.toISOString() },
          });
          return { kind: 'reuse_detected' };
        }

        const user = await manager
          .getRepository(User)
          .findOneBy({ id: session.userId });
        if (!user || !user.isActive) {
          return { kind: 'rejected' };
        }

        const rotated = issueRefreshToken(session.id);
        session.refreshTokenHash = rotated.secretHash;
        session.lastUsedAt = new Date();
        // expires_at is NOT extended: a session has an absolute lifetime from login.
        await sessions.save(session);

        return {
          kind: 'rotated',
          tokens: await this.buildTokens(user, session.id, rotated.token),
        };
      },
    );

    if (outcome.kind !== 'rotated') {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }
    return outcome.tokens;
  }

  /** Revokes the session of the current access token. */
  async logout(principal: AuthPrincipal, actor: RequestActor): Promise<number> {
    return this.revokeSessions(principal, actor, 'current');
  }

  /** Revokes every open session of the current user (all devices). */
  async logoutAll(
    principal: AuthPrincipal,
    actor: RequestActor,
  ): Promise<number> {
    return this.revokeSessions(principal, actor, 'all');
  }

  async me(principal: AuthPrincipal): Promise<MeDto> {
    const user = await this.users.findOneBy({ id: principal.id });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return {
      id: principal.id,
      email: principal.email,
      name: user.name,
      role: principal.role,
      actorType: principal.actorType,
      authMethod: principal.authMethod,
      ...(principal.sessionId && { sessionId: principal.sessionId }),
      ...(principal.apiKeyId && { apiKeyId: principal.apiKeyId }),
    };
  }

  private revokeSessions(
    principal: AuthPrincipal,
    actor: RequestActor,
    scope: 'current' | 'all',
  ): Promise<number> {
    // TypeORM ignores `undefined` in a where clause, so without this check a
    // "current" logout without a session would revoke ALL sessions.
    if (scope === 'current' && !principal.sessionId) {
      throw new ForbiddenException(
        'Only a session (bearer token) can be logged out',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const result = await manager.getRepository(Session).update(
        {
          userId: principal.id,
          ...(scope === 'current' && { id: principal.sessionId }),
          revokedAt: IsNull(),
        },
        { revokedAt: new Date() },
      );
      const revokedSessions = result.affected ?? 0;

      await this.audit.record(manager, {
        actor,
        action:
          scope === 'current'
            ? AuditAction.AuthLogout
            : AuditAction.AuthLogoutAll,
        resourceType: AuditResourceType.Session,
        resourceId: scope === 'current' ? (principal.sessionId ?? null) : null,
        changes: { revokedSessions },
      });
      return revokedSessions;
    });
  }

  private async buildTokens(
    user: User,
    sessionId: string,
    refreshToken: string,
  ): Promise<AuthTokensDto> {
    return {
      accessToken: await this.tokens.signAccessToken({
        sub: user.id,
        sid: sessionId,
        role: user.role,
      }),
      refreshToken,
      accessTokenExpiresIn: this.tokens.accessTokenTtlSeconds,
      tokenType: 'Bearer',
      user: UserResponseDto.from(user),
    };
  }

  private principalFor(user: User, sessionId: string): AuthPrincipal {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      actorType: user.role === UserRole.Agent ? 'agent' : 'user',
      authMethod: 'jwt',
      sessionId,
    };
  }

  private get bcryptRounds(): number {
    return this.config.get('BCRYPT_ROUNDS', { infer: true });
  }

  private get refreshTtlSeconds(): number {
    return this.config.get('REFRESH_TOKEN_TTL_SECONDS', { infer: true });
  }
}
