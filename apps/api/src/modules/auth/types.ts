export interface LoginOwner {
  ownerId: string;
  shopId: string;
  shopName: string;
  pinHash: string;
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
  hasOwner(): Promise<boolean>;
  createShopWithOwner(input: {
    shopName: string;
    pinHash: string;
  }): Promise<{ shopId: string; ownerId: string }>;
  findOwnerForLogin(): Promise<LoginOwner | null>;
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
  | 'setup-required'
  | 'already-setup'
  | 'invalid-pin'
  | 'locked'
  | 'unauthorized';

export interface AuthService {
  setup(input: { shopName: string; pin: string; deviceLabel?: string }): Promise<Session>;
  unlock(input: { pin: string; deviceLabel?: string }): Promise<Session>;
  verifyToken(token: string): Promise<AuthContext | null>;
  logout(tokenId: string): Promise<void>;
}
