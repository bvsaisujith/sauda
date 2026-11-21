import { describe, expect, it } from 'vitest';
import { createAuthService } from './auth-service.js';
import { AuthError } from './auth-errors.js';
import { OwnerExistsError } from './owner-exists-error.js';
import type { AuditRecord, AuthStore, LoginOwner, TokenRecord } from './types.js';

interface MemoryState {
  owner: (LoginOwner & { shopName: string }) | null;
  tokens: (TokenRecord & { tokenHash: string; lastUsedAt: Date | null })[];
  audits: AuditRecord[];
}

function createMemoryStore(): { store: AuthStore; state: MemoryState } {
  const state: MemoryState = { owner: null, tokens: [], audits: [] };
  let sequence = 0;

  const store: AuthStore = {
    async hasOwner() {
      return state.owner !== null;
    },
    async createShopWithOwner(input) {
      if (state.owner) {
        throw new OwnerExistsError();
      }
      state.owner = {
        ownerId: 'owner_1',
        shopId: 'shop_1',
        shopName: input.shopName,
        pinHash: input.pinHash,
      };
      return { shopId: 'shop_1', ownerId: 'owner_1' };
    },
    async findOwnerForLogin() {
      return state.owner;
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

async function setupOwner(): Promise<{
  service: ReturnType<typeof createAuthService>;
  state: MemoryState;
  clock: ReturnType<typeof setupClock>;
  token: string;
}> {
  const { store, state } = createMemoryStore();
  const clock = setupClock();
  const service = createAuthService(store, { now: clock.now, tokenTtlDays: 30 });
  const session = await service.setup({ shopName: 'Sauda Kirana', pin: '4821' });

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
  it('sets up one owner, hashes the PIN and returns a session', async () => {
    const { state, token } = await setupOwner();

    expect(state.owner?.pinHash).not.toContain('4821');
    expect(state.owner?.shopName).toBe('Sauda Kirana');
    expect(state.tokens).toHaveLength(1);
    expect(token.startsWith('sauda_')).toBe(true);
    expect(state.audits.map((entry) => entry.operation)).toEqual(['auth.setup']);
  });

  it('refuses a second setup', async () => {
    const { service } = await setupOwner();
    await expectAuthError(service.setup({ shopName: 'Another', pin: '1111' }), 'already-setup');
  });

  it('requires setup before the first unlock', async () => {
    const { store } = createMemoryStore();
    const service = createAuthService(store);
    await expectAuthError(service.unlock({ pin: '4821' }), 'setup-required');
  });

  it('rejects a wrong PIN and audits the attempt', async () => {
    const { service, state } = await setupOwner();

    await expectAuthError(service.unlock({ pin: '0000' }), 'invalid-pin');

    expect(state.audits.at(-1)).toMatchObject({
      operation: 'auth.unlock.failed',
      ownerId: 'owner_1',
    });
    expect(state.audits.at(-1)).not.toHaveProperty('after.pin');
  });

  it('locks after five wrong attempts, even for the right PIN', async () => {
    const { service } = await setupOwner();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expectAuthError(service.unlock({ pin: '0000' }), 'invalid-pin');
    }

    const locked = await expectAuthError(service.unlock({ pin: '4821' }), 'locked');
    expect(locked.status).toBe(423);
    expect(locked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('unlocks with the right PIN and verifies the issued token', async () => {
    const { service } = await setupOwner();
    const session = await service.unlock({ pin: '4821', deviceLabel: 'Pixel' });

    await expect(service.verifyToken(session.token)).resolves.toMatchObject({
      ownerId: 'owner_1',
      shopId: 'shop_1',
      shopName: 'Sauda Kirana',
    });
  });

  it('rejects an expired token', async () => {
    const { service, clock, token } = await setupOwner();

    clock.advanceDays(30);
    await expect(service.verifyToken(token)).resolves.toBeNull();
  });

  it('rejects a revoked token and logout revokes the current one', async () => {
    const { service, state, token } = await setupOwner();
    const context = await service.verifyToken(token);

    expect(context).not.toBeNull();
    await service.logout(context!.tokenId);

    await expect(service.verifyToken(token)).resolves.toBeNull();
    expect(state.tokens[0]?.revokedAt).not.toBeNull();
  });

  it('rejects tokens that were never issued', async () => {
    const { service } = await setupOwner();
    await expect(service.verifyToken('sauda_unknown_but_well_formed_token_value')).resolves.toBeNull();
    await expect(service.verifyToken('not-a-token')).resolves.toBeNull();
  });
});
