import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { AuditActorType, AuditOutcome } from '../enums/audit.enums';

/**
 * One row per write action (and per denied attempt). Rows are append-only:
 * a database trigger rejects UPDATE and DELETE (see the migration).
 * Actor email and role are snapshots taken when the action happened.
 */
@Entity({ name: 'audit_logs' })
@Index('IDX_audit_logs_occurred_at', ['occurredAt'])
@Index('IDX_audit_logs_resource', ['resourceType', 'resourceId'])
@Index('IDX_audit_logs_actor_id', ['actorId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_audit_logs' })
  id!: string;

  @CreateDateColumn({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  /** NULL for anonymous actors. Users are never deleted, so the FK always resolves. */
  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({
    name: 'actor_id',
    foreignKeyConstraintName: 'FK_audit_logs_actor_id',
  })
  actor!: Relation<User> | null;

  @Column({
    name: 'actor_type',
    type: 'enum',
    enum: AuditActorType,
    enumName: 'audit_actor_type',
  })
  actorType!: AuditActorType;

  @Column({ name: 'actor_email', type: 'varchar', length: 255, nullable: true })
  actorEmail!: string | null;

  @Column({ name: 'actor_role', type: 'varchar', length: 32, nullable: true })
  actorRole!: string | null;

  /** 'jwt' or 'api_key'; NULL for anonymous actors. */
  @Column({ name: 'auth_method', type: 'varchar', length: 16, nullable: true })
  authMethod!: string | null;

  @Column({ name: 'action', type: 'varchar', length: 64 })
  action!: string;

  @Column({
    name: 'outcome',
    type: 'enum',
    enum: AuditOutcome,
    enumName: 'audit_outcome',
  })
  outcome!: AuditOutcome;

  @Column({
    name: 'resource_type',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  resourceType!: string | null;

  @Column({ name: 'resource_id', type: 'uuid', nullable: true })
  resourceId!: string | null;

  /** What changed: a snapshot for create/delete, `{ field: { from, to } }` for updates. */
  @Column({ name: 'changes', type: 'jsonb', nullable: true })
  changes!: Record<string, unknown> | null;

  /** Extra context, e.g. method/path/required roles for a denied attempt. */
  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ name: 'request_id', type: 'varchar', length: 64, nullable: true })
  requestId!: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress!: string | null;
}
