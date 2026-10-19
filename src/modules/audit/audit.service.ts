import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type DeepPartial, type EntityManager, Repository } from 'typeorm';
import { PaginatedResult } from '../../common/pagination/paginated-result';
import { UserRole } from '../users/enums/user-role.enum';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import { AuditLog } from './entities/audit-log.entity';
import {
  AuditAction,
  AuditActorType,
  AuditOutcome,
  AuditResourceType,
} from './enums/audit.enums';
import type { RequestActor } from './request-actor';

export interface AuditEntry {
  actor: RequestActor;
  action: AuditAction;
  outcome?: AuditOutcome;
  resourceType?: AuditResourceType;
  resourceId?: string | null;
  changes?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  /**
   * Overrides the actor id, e.g. for a registration (the actor is anonymous,
   * but the new user is known).
   */
  actorIdOverride?: string;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogs: Repository<AuditLog>,
  ) {}

  /**
   * Records an audit row with the given EntityManager, i.e. inside the caller's
   * transaction: the row is committed together with the change it describes,
   * or rolled back with it. This keeps the log accurate.
   */
  async record(manager: EntityManager, entry: AuditEntry): Promise<void> {
    const repository = manager.getRepository(AuditLog);
    await repository.save(repository.create(this.toRow(entry)));
  }

  /** Records outside any transaction (denied attempts, where nothing else is written). */
  async recordStandalone(entry: AuditEntry): Promise<void> {
    await this.auditLogs.save(this.auditLogs.create(this.toRow(entry)));
  }

  async list(query: ListAuditLogsQueryDto): Promise<PaginatedResult<AuditLog>> {
    const qb = this.auditLogs
      .createQueryBuilder('log')
      .orderBy('log.occurredAt', 'DESC')
      .addOrderBy('log.id', 'DESC')
      .skip(query.offset)
      .take(query.limit);

    if (query.actorId)
      qb.andWhere('log.actorId = :actorId', { actorId: query.actorId });
    if (query.action)
      qb.andWhere('log.action = :action', { action: query.action });
    if (query.outcome)
      qb.andWhere('log.outcome = :outcome', { outcome: query.outcome });
    if (query.resourceType) {
      qb.andWhere('log.resourceType = :resourceType', {
        resourceType: query.resourceType,
      });
    }
    if (query.resourceId) {
      qb.andWhere('log.resourceId = :resourceId', {
        resourceId: query.resourceId,
      });
    }
    if (query.from)
      qb.andWhere('log.occurredAt >= :from', { from: query.from });
    if (query.to) qb.andWhere('log.occurredAt <= :to', { to: query.to });

    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResult(items, total, query.page, query.limit);
  }

  private toRow(entry: AuditEntry): DeepPartial<AuditLog> {
    const principal = entry.actor.principal;
    let actorType = AuditActorType.Anonymous;
    if (principal) {
      actorType =
        principal.role === UserRole.Agent
          ? AuditActorType.Agent
          : AuditActorType.User;
    }

    return {
      actorId: entry.actorIdOverride ?? principal?.id ?? null,
      actorType,
      actorEmail: principal?.email ?? null,
      actorRole: principal?.role ?? null,
      authMethod: principal?.authMethod ?? null,
      action: entry.action,
      outcome: entry.outcome ?? AuditOutcome.Success,
      resourceType: entry.resourceType ?? null,
      resourceId: entry.resourceId ?? null,
      changes: entry.changes ?? null,
      metadata: entry.metadata ?? null,
      requestId: entry.actor.requestId,
      ipAddress: entry.actor.ipAddress,
    };
  }
}
