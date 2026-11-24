export interface LoginOwner {
  ownerId: string;
  shopId: string;
  shopName: string;
  passwordHash: string;
}

export interface TokenRecord {
  id: string;
  ownerId: string;
  shopId: string;
  shopName: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface AuditRecord {
  shopId: string;
  ownerId: string;
  operation: string;
  entityId: string;
  after?: Record<string, unknown>;
}

export interface AuthStore {
  createShopWithOwner(input: {
    shopName: string;
    loginKey: string;
    passwordHash: string;
  }): Promise<{ shopId: string; ownerId: string }>;
  findOwnerForLogin(loginKey: string): Promise<LoginOwner | null>;
  insertToken(input: {
    ownerId: string;
    tokenHash: string;
    label: string | null;
    expiresAt: Date;
  }): Promise<void>;
  findToken(tokenHash: string): Promise<TokenRecord | null>;
  touchToken(tokenId: string, at: Date): Promise<void>;
  revokeToken(tokenId: string, at: Date): Promise<void>;
  recordAudit(record: AuditRecord): Promise<void>;
}

export interface AuthContext {
  ownerId: string;
  shopId: string;
  shopName: string;
  tokenId: string;
}

export interface Session {
  token: string;
  expiresAt: string;
  shop: { id: string; name: string };
  owner: { id: string };
}

export interface SessionInfo {
  shop: { id: string; name: string };
  owner: { id: string };
}

export type AuthErrorCode =
  | 'shop-exists'
  | 'invalid-credentials'
  | 'locked'
  | 'unauthorized';

export interface AuthService {
  signUp(input: { shopName: string; password: string; deviceLabel?: string }): Promise<Session>;
  signIn(input: { shopName: string; password: string; deviceLabel?: string }): Promise<Session>;
  verifyToken(token: string): Promise<AuthContext | null>;
  logout(tokenId: string): Promise<void>;
}

/**
 * Shops are matched on a trimmed, lowercased key so "Sri Lakshmi Kirana" and
 * "sri lakshmi kirana" reach the same account, while the owner still sees the
 * name the way they typed it.
 */
export function loginKeyFor(shopName: string): string {
  return shopName.trim().toLowerCase();
}