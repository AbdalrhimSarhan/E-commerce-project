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

/** API key of an agent. The full key is shown once at creation and never stored. */
@Entity({ name: 'api_keys' })
@Unique('UQ_api_keys_key_hash', ['keyHash'])
export class ApiKey {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_api_keys' })
  id!: string;

  @Index('IDX_api_keys_user_id')
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_api_keys_user_id',
  })
  user!: Relation<User>;

  @Column({ name: 'name', type: 'varchar', length: 100 })
  name!: string;

  /** e.g. `pmk_1a2b3c4d`: lets humans recognize a key without seeing it. */
  @Column({ name: 'key_prefix', type: 'varchar', length: 16 })
  keyPrefix!: string;

  /** sha256 (hex) of the full key; the lookup value when a request presents a key. */
  @Column({ name: 'key_hash', type: 'varchar', length: 64 })
  keyHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
