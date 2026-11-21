import { describe, expect, it } from 'vitest';
import { hashPin, verifyPin } from './pin.js';

describe('PIN hashing', () => {
  it('verifies the correct PIN', async () => {
    const stored = await hashPin('4821');
    await expect(verifyPin('4821', stored)).resolves.toBe(true);
  });

  it('rejects a different PIN', async () => {
    const stored = await hashPin('4821');
    await expect(verifyPin('4822', stored)).resolves.toBe(false);
  });

  it('never stores the PIN itself', async () => {
    const stored = await hashPin('4821');
    expect(stored).not.toContain('4821');
    expect(stored.startsWith('scrypt$')).toBe(true);
  });

  it('salts each hash separately', async () => {
    const first = await hashPin('4821');
    const second = await hashPin('4821');
    expect(first).not.toBe(second);
    await expect(verifyPin('4821', first)).resolves.toBe(true);
    await expect(verifyPin('4821', second)).resolves.toBe(true);
  });

  it('rejects malformed hashes instead of throwing', async () => {
    await expect(verifyPin('4821', '')).resolves.toBe(false);
    await expect(verifyPin('4821', 'bcrypt$10$abc$def')).resolves.toBe(false);
    await expect(verifyPin('4821', 'scrypt$notanumber$8$1$abc$def')).resolves.toBe(false);
  });
});
