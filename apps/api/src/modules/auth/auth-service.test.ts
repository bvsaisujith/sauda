import { describe, expect, it } from 'vitest';
import { createAuthService } from './auth-service.js';
import { AuthError } from './auth-errors.js';
import { ShopExistsError } from './shop-exists-error.js';
import { loginKeyFor } from './types.js';
import type { AuditRecord, AuthStore, LoginOwner, TokenRecord } from './types.js';

interface MemoryState {
  owner: (LoginOwner & { shopName: string; loginKey: string }) | null;
  tokens: (TokenRecord & { tokenHash: string; lastUsedAt: Date | null })[];
  audits: AuditRecord[];
}

function createMemoryStore(): { store: AuthStore; state: MemoryState } {
  const state: MemoryState = { owner: null, tokens: [], audits: [] };
  let sequence = 0;

  const store: AuthStore = {
    async createShopWithOwner(input) {
      if (state.owner) {
        throw new ShopExistsError();
      }
      state.owner = {
        ownerId: 'owner_1',
        shopId: 'shop_1',
        shopName: input.shopName,
        loginKey: input.loginKey,
        passwordHash: input.passwordHash,
      };
      return { shopId: 'shop_1', ownerId: 'owner_1' };
    },
    async findOwnerForLogin(loginKey) {
      return state.owner?.loginKey === loginKey ? state.owner : null;
    },
    async insertToken(input) {
      sequence += 1;
      const owner = state.owner!;
      state.tokens.push({
        id: `token_${sequence}`,
        ownerId: input.ownerId,
        shopId: owner.shopId,
        shopName: owner.shopName,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        revokedAt: null,
        lastUsedAt: null,
      });
    },
    async findToken(tokenHash) {
      return state.tokens.find((token) => token.tokenHash === tokenHash) ?? null;
    },
    async touchToken(tokenId, at) {
      const token = state.tokens.find((candidate) => candidate.id === tokenId);
      if (token) {
        token.lastUsedAt = at;
      }
    },
    async revokeToken(tokenId, at) {
      const token = state.tokens.find((candidate) => candidate.id === tokenId);
      if (token) {
        token.revokedAt = at;
      }
    },
    async recordAudit(record) {
      state.audits.push(record);
    },
  };

  return { store, state };
}

function setupClock(start = '2026-11-21T09:00:00.000Z'): {
  now: () => Date;
  advanceDays: (days: number) => void;
} {
  let current = new Date(start);
  return {
    now: () => current,
    advanceDays: (days: number) => {
      current = new Date(current.getTime() + days * 24 * 60 * 60 * 1000);
    },
  };
}

async function registerShop(): Promise<{
  service: ReturnType<typeof createAuthService>;
  state: MemoryState;
  clock: ReturnType<typeof setupClock>;
  token: string;
}> {
  const { store, state } = createMemoryStore();
  const clock = setupClock();
  const service = createAuthService(store, { now: clock.now, tokenTtlDays: 30 });
  const session = await service.signUp({ shopName: 'Sauda Kirana', password: 'kirana2026' });

  return { service, state, clock, token: session.token };
}

async function expectAuthError(
  promise: Promise<unknown>,
  code: AuthError['code'],
): Promise<AuthError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AuthError);
    const authError = error as AuthError;
    expect(authError.code).toBe(code);
    return authError;
  }

  throw new Error(`Expected ${code}, but the call succeeded`);
}

describe('auth service', () => {
  it('creates a shop account, salts the password and returns a session', async () => {
    const { state, token } = await registerShop();

    expect(state.owner?.passwordHash).not.toContain('kirana2026');
    expect(state.owner?.passwordHash.startsWith('scrypt$')).toBe(true);
    expect(state.owner?.shopName).toBe('Sauda Kirana');
    expect(state.tokens).toHaveLength(1);
    expect(token.startsWith('sauda_')).toBe(true);
    expect(state.audits.map((entry) => entry.operation)).toEqual(['auth.signup']);
  });

  it('refuses a duplicate shop name', async () => {
    const { service } = await registerShop();
    await expectAuthError(
      service.signUp({ shopName: 'sauda kirana', password: 'another2026' }),
      'shop-exists',
    );
  });

  it('rejects wrong credentials without revealing which field was wrong', async () => {
    const { service } = await registerShop();

    const wrongPassword = await expectAuthError(
      service.signIn({ shopName: 'Sauda Kirana', password: 'wrong2026' }),
      'invalid-credentials',
    );
    const unknownShop = await expectAuthError(
      service.signIn({ shopName: 'Nope Kirana', password: 'wrong2026' }),
      'invalid-credentials',
    );

    expect(wrongPassword.message).toBe(unknownShop.message);
  });

  it('audits a failed sign-in without storing the password', async () => {
    const { service, state } = await registerShop();

    await expectAuthError(
      service.signIn({ shopName: 'Sauda Kirana', password: 'wrong2026' }),
      'invalid-credentials',
    );

    expect(state.audits.at(-1)).toMatchObject({
      operation: 'auth.signin.failed',
      ownerId: 'owner_1',
    });
    expect(state.audits.at(-1)).not.toHaveProperty('after.password');
  });

  it('locks after five wrong attempts, even for the right password', async () => {
    const { service } = await registerShop();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expectAuthError(
        service.signIn({ shopName: 'Sauda Kirana', password: 'wrong2026' }),
        'invalid-credentials',
      );
    }

    const locked = await expectAuthError(
      service.signIn({ shopName: 'Sauda Kirana', password: 'kirana2026' }),
      'locked',
    );
    expect(locked.status).toBe(423);
    expect(locked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('signs in with the right credentials, ignoring shop name case', async () => {
    const { service } = await registerShop();
    const session = await service.signIn({
      shopName: '  SAUDa KIRANA ',
      password: 'kirana2026',
      deviceLabel: 'Pixel',
    });

    expect(session.shop.name).toBe('Sauda Kirana');

    await expect(service.verifyToken(session.token)).resolves.toMatchObject({
      ownerId: 'owner_1',
      shopId: 'shop_1',
      shopName: 'Sauda Kirana',
    });
  });

  it('normalises shop names for login lookup', () => {
    expect(loginKeyFor('  Sri Lakshmi Kirana ')).toBe('sri lakshmi kirana');
  });

  it('rejects an expired token', async () => {
    const { service, clock, token } = await registerShop();

    clock.advanceDays(30);
    await expect(service.verifyToken(token)).resolves.toBeNull();
  });

  it('rejects a revoked token and logout revokes the current one', async () => {
    const { service, state, token } = await registerShop();
    const context = await service.verifyToken(token);

    expect(context).not.toBeNull();
    await service.logout(context!.tokenId);

    await expect(service.verifyToken(token)).resolves.toBeNull();
    expect(state.tokens[0]?.revokedAt).not.toBeNull();
  });

  it('rejects tokens that were never issued', async () => {
    const { service } = await registerShop();
    await expect(
      service.verifyToken('sauda_unknown_but_well_formed_token_value'),
    ).resolves.toBeNull();
    await expect(service.verifyToken('not-a-token')).resolves.toBeNull();
  });
});