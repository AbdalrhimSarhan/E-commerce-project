export enum AuditOutcome {
  Success = 'success',
  /** The authorization layer refused the request (403). */
  Denied = 'denied',
}

export enum AuditActorType {
  User = 'user',
  Agent = 'agent',
  /** No credentials, e.g. a registration. */
  Anonymous = 'anonymous',
}

/** Stable action names. Format: `<resource>.<verb>`. */
export enum AuditAction {
  AuthRegister = 'auth.register',
  AuthLogin = 'auth.login',
  AuthLogout = 'auth.logout',
  AuthLogoutAll = 'auth.logout_all',
  AuthRefreshReuseDetected = 'auth.refresh_reuse_detected',
  UserDeactivate = 'user.deactivate',
  UserActivate = 'user.activate',
  ProductCreate = 'product.create',
  ProductUpdate = 'product.update',
  ProductDelete = 'product.delete',
  CategoryCreate = 'category.create',
  CategoryUpdate = 'category.update',
  CategoryDelete = 'category.delete',
  CategoryProductsAdd = 'category.products.add',
  CategoryProductsRemove = 'category.products.remove',
  CategoryProductsReplace = 'category.products.replace',
  AccessDenied = 'access.denied',
}

export enum AuditResourceType {
  User = 'user',
  Session = 'session',
  Product = 'product',
  Category = 'category',
}
