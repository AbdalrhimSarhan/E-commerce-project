/**
 * Stored as the PostgreSQL enum `user_role`. There is no implicit hierarchy:
 * every endpoint lists the roles it allows explicitly.
 */
export enum UserRole {
  /** Everything an admin can do, plus account management. Exactly one exists. */
  SuperAdmin = 'super_admin',
  Admin = 'admin',
  User = 'user',
  /** AI agent: authenticates only with an API key, never with a password. */
  Agent = 'agent',
}
