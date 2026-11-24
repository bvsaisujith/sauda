import { AuthError } from './auth-errors.js';
import { hashPassword, verifyPassword } from './password.js';
import { LoginThrottle } from './throttle.js';
import { generateToken, hashToken, looksLikeToken } from './tokens.js';
import { ShopExistsError } from './shop-exists-error.js';
import { loginKeyFor } from './types.js';
import type { AuthContext, AuthService, AuthStore, Session, TokenRecord } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TOKEN_TTL_DAYS = 180;

export interface AuthServiceOptions {
  now?: () => Date;
  tokenTtlDays?: number;
  throttle?: LoginThrottle;
}

export function createAuthService(store: AuthStore, options: AuthServiceOptions = {}): AuthService {
  const now = options.now ?? (() => new Date());
  const tokenTtlDays = options.tokenTtlDays ?? DEFAULT_TOKEN_TTL_DAYS;
  const throttle = options.throttle ?? new LoginThrottle(() => now().getTime());

  async function issueToken(input: {
    ownerId: string;
    shopId: string;
    shopName: string;
    deviceLabel?: string;
  }): Promise<Session> {
    const pair = generateToken();
    const expiresAt = new Date(now().getTime() + tokenTtlDays * DAY_MS);

    await store.insertToken({
      ownerId: input.ownerId,
      tokenHash: pair.hash,
      label: input.deviceLabel ?? null,
      expiresAt,
    });

    return {
      token: pair.raw,
      expiresAt: expiresAt.toISOString(),
      shop: { id: input.shopId, name: input.shopName },
      owner: { id: input.ownerId },
    };
  }

  async function validToken(raw: string): Promise<TokenRecord | null> {
    if (!looksLikeToken(raw)) {
      return null;
    }

    const record = await store.findToken(hashToken(raw));

    if (!record || record.revokedAt !== null || record.expiresAt.getTime() <= now().getTime()) {
      return null;
    }

    await store.touchToken(record.id, now());
    return record;
  }

  return {
    async signUp(input) {
      const loginKey = loginKeyFor(input.shopName);
      const passwordHash = await hashPassword(input.password);

      let created: { shopId: string; ownerId: string };

      try {
        created = await store.createShopWithOwner({
          shopName: input.shopName,
          loginKey,
          passwordHash,
        });
      } catch (error) {
        if (error instanceof ShopExistsError) {
          throw new AuthError('shop-exists', 'That shop name is already registered. Sign in instead.');
        }
        throw error;
      }

      await store.recordAudit({
        shopId: created.shopId,
        ownerId: created.ownerId,
        operation: 'auth.signup',
        entityId: created.ownerId,
      });

      return issueToken({
        ownerId: created.ownerId,
        shopId: created.shopId,
        shopName: input.shopName,
        ...(input.deviceLabel === undefined ? {} : { deviceLabel: input.deviceLabel }),
      });
    },

    async signIn(input) {
      const loginKey = loginKeyFor(input.shopName);

      // Unknown shops are throttled on the attempted name so repeated guessing
      // from one device is still rate limited.
      const owner = await store.findOwnerForLogin(loginKey);

      if (!owner) {
        throttle.recordFailure(loginKey);

        const lock = throttle.check(loginKey);

        if (lock.locked) {
          throw new AuthError(
            'locked',
            'Too many sign-in attempts; try again later',
            lock.retryAfterSeconds,
          );
        }

        throw new AuthError('invalid-credentials', 'Shop name or password is incorrect');
      }

      const lock = throttle.check(owner.ownerId);

      if (lock.locked) {
        throw new AuthError(
          'locked',
          'Too many sign-in attempts; try again later',
          lock.retryAfterSeconds,
        );
      }

      if (!(await verifyPassword(input.password, owner.passwordHash))) {
        throttle.recordFailure(owner.ownerId);
        await store.recordAudit({
          shopId: owner.shopId,
          ownerId: owner.ownerId,
          operation: 'auth.signin.failed',
          entityId: owner.ownerId,
        });
        throw new AuthError('invalid-credentials', 'Shop name or password is incorrect');
      }

      throttle.reset(owner.ownerId);

      return issueToken({
        ownerId: owner.ownerId,
        shopId: owner.shopId,
        shopName: owner.shopName,
        ...(input.deviceLabel === undefined ? {} : { deviceLabel: input.deviceLabel }),
      });
    },

    async verifyToken(token: string): Promise<AuthContext | null> {
      const record = await validToken(token);

      if (!record) {
        return null;
      }

      return {
        ownerId: record.ownerId,
        shopId: record.shopId,
        shopName: record.shopName,
        tokenId: record.id,
      };
    },

    async logout(tokenId: string): Promise<void> {
      await store.revokeToken(tokenId, now());
    },
  };
}