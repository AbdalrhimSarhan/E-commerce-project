import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { PaginatedResult } from '../../common/pagination/paginated-result';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditResourceType } from '../audit/enums/audit.enums';
import type { RequestActor } from '../audit/request-actor';
import { Session } from '../auth/entities/session.entity';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  /** `email` must already be normalized (see normalizeEmail). */
  findByEmail(email: string): Promise<User | null> {
    return this.users.findOneBy({ email });
  }

  async list(query: ListUsersQueryDto): Promise<PaginatedResult<User>> {
    const [items, total] = await this.users.findAndCount({
      where: {
        ...(query.role !== undefined && { role: query.role }),
        ...(query.isActive !== undefined && { isActive: query.isActive }),
      },
      order: { createdAt: 'ASC', id: 'ASC' },
      skip: query.offset,
      take: query.limit,
    });
    return new PaginatedResult(items, total, query.page, query.limit);
  }

  /**
   * Removes all access of a user: is_active = false AND every open session is
   * revoked, in one transaction. A super_admin can never be deactivated through
   * the API (this also prevents the super_admin from locking themselves out).
   * Agents' API keys need no revocation: the middleware rejects keys of
   * inactive users.
   */
  deactivate(userId: string, actor: RequestActor): Promise<User> {
    return this.dataSource.transaction(async (manager) => {
      const user = await this.lockUser(manager.getRepository(User), userId);

      if (user.role === UserRole.SuperAdmin) {
        throw new ForbiddenException(
          'A super_admin account cannot be deactivated',
        );
      }
      if (!user.isActive) {
        return user; // Nothing to change, nothing to audit.
      }

      user.isActive = false;
      const saved = await manager.getRepository(User).save(user);
      const revoked = await manager
        .getRepository(Session)
        .update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });

      await this.audit.record(manager, {
        actor,
        action: AuditAction.UserDeactivate,
        resourceType: AuditResourceType.User,
        resourceId: userId,
        changes: {
          isActive: { from: true, to: false },
          revokedSessions: revoked.affected ?? 0,
        },
      });
      return saved;
    });
  }

  /** Sets is_active = true. Sessions revoked by the deactivation stay revoked. */
  activate(userId: string, actor: RequestActor): Promise<User> {
    return this.dataSource.transaction(async (manager) => {
      const user = await this.lockUser(manager.getRepository(User), userId);
      if (user.isActive) {
        return user;
      }

      user.isActive = true;
      const saved = await manager.getRepository(User).save(user);
      await this.audit.record(manager, {
        actor,
        action: AuditAction.UserActivate,
        resourceType: AuditResourceType.User,
        resourceId: userId,
        changes: { isActive: { from: false, to: true } },
      });
      return saved;
    });
  }

  /** Loads the user with a row lock, so concurrent (de)activations run one after the other. */
  private async lockUser(
    users: Repository<User>,
    userId: string,
  ): Promise<User> {
    const user = await users.findOne({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
