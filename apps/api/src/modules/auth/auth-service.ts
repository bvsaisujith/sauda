import { AuthError } from './auth-errors.js';
import { OwnerExistsError } from './owner-exists-error.js';
import { hashPin, verifyPin } from './pin.js';
import { PinThrottle } from './throttle.js';
import { generateToken, hashToken, looksLikeToken } from './tokens.js';
import type { AuthContext, AuthService, AuthStore, Session, TokenRecord } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TOKEN_TTL_DAYS = 180;

export interface AuthServiceOptions {
  now?: () => Date;
  tokenTtlDays?: number;
  throttle?: PinThrottle;
}

export function createAuthService(store: AuthStore, options: AuthServiceOptions = {}): AuthService {
  const now = options.now ?? (() => new Date());
  const tokenTtlDays = options.tokenTtlDays ?? DEFAULT_TOKEN_TTL_DAYS;
  const throttle = options.throttle ?? new PinThrottle(() => now().getTime());

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
    async setup(input) {
      if (await store.hasOwner()) {
        throw new AuthError('already-setup', 'This shop already has an owner');
      }

      const pinHash = await hashPin(input.pin);

      let created: { shopId: string; ownerId: string };

      try {
        created = await store.createShopWithOwner({ shopName: input.shopName, pinHash });
      } catch (error) {
        if (error instanceof OwnerExistsError) {
          throw new AuthError('already-setup', 'This shop already has an owner');
        }
        throw error;
      }

      await store.recordAudit({
        shopId: created.shopId,
        ownerId: created.ownerId,
        operation: 'auth.setup',
        entityId: created.ownerId,
      });

      return issueToken({
        ownerId: created.ownerId,
        shopId: created.shopId,
        shopName: input.shopName,
        ...(input.deviceLabel === undefined ? {} : { deviceLabel: input.deviceLabel }),
      });
    },

    async unlock(input) {
      const owner = await store.findOwnerForLogin();

      if (!owner) {
        throw new AuthError('setup-required', 'No owner exists yet; set up a PIN first');
      }

      const lock = throttle.check(owner.ownerId);

      if (lock.locked) {
        throw new AuthError(
          'locked',
          'Too many incorrect PIN attempts; try again later',
          lock.retryAfterSeconds,
        );
      }

      if (!(await verifyPin(input.pin, owner.pinHash))) {
        throttle.recordFailure(owner.ownerId);
        await store.recordAudit({
          shopId: owner.shopId,
          ownerId: owner.ownerId,
          operation: 'auth.unlock.failed',
          entityId: owner.ownerId,
        });
        throw new AuthError('invalid-pin', 'PIN is incorrect');
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
