import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '../enums/user-role.enum';

@Entity({ name: 'users' })
@Unique('UQ_users_email', ['email'])
// Emails are always stored trimmed and lowercase.
@Check('CHK_users_email_normalized', `"email" = lower(btrim("email"))`)
// Agents never have a password; every other role must have one.
@Check(
  'CHK_users_password_by_role',
  `("role" = 'agent') = ("password_hash" IS NULL)`,
)
// At most one super_admin: a unique index over the rows where role = 'super_admin'.
@Index('UQ_users_single_super_admin', ['role'], {
  unique: true,
  where: `"role" = 'super_admin'`,
})
export class User {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_users' })
  id!: string;

  @Column({ name: 'email', type: 'varchar', length: 255 })
  email!: string;

  /** bcrypt hash; NULL only for agents. Never returned by the API. */
  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  passwordHash!: string | null;

  @Column({ name: 'name', type: 'varchar', length: 100 })
  name!: string;

  @Column({
    name: 'role',
    type: 'enum',
    enum: UserRole,
    enumName: 'user_role',
    default: UserRole.User,
  })
  role!: UserRole;

  /** Users are never deleted; access is removed by setting this to false. */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
