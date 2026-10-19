import type { UserRole } from '../../users/enums/user-role.enum';

export type ActorType = 'user' | 'agent';
export type AuthMethod = 'jwt' | 'api_key';

/**
 * "Who is calling?" Set on `req.user` by AuthenticationMiddleware. The role
 * always comes from the database, never from the token, so role changes and
 * deactivation apply immediately.
 */
export interface AuthPrincipal {
  id: string;
  email: string;
  role: UserRole;
  /** 'agent' when the role is agent, otherwise 'user'. */
  actorType: ActorType;
  authMethod: AuthMethod;
  /** Only for authMethod 'jwt'. */
  sessionId?: string;
  /** Only for authMethod 'api_key'. */
  apiKeyId?: string;
}
