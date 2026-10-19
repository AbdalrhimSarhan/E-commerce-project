import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * One login. Its id is the `sid` claim of the access token, and the first part
 * of the refresh token (`<sessionId>.<secret>`).
 */
@Entity({ name: 'sessions' })
@Unique('UQ_sessions_refresh_token_hash', ['refreshTokenHash'])
export class Session {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_sessions' })
  id!: string;

  @Index('IDX_sessions_user_id')
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_sessions_user_id',
  })
  user!: Relation<User>;

  /** sha256 (hex) of the refresh token secret. The secret itself is never stored. */
  @Column({ name: 'refresh_token_hash', type: 'varchar', length: 64 })
  refreshTokenHash!: string;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent!: string | null;

  /** 45 chars fits the longest IPv6 text form (IPv4-mapped). */
  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
