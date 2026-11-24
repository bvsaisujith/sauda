import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('round-trips a password', async () => {
    const stored = await hashPassword('kirana2026');

    await expect(verifyPassword('kirana2026', stored)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('kirana2026');

    await expect(verifyPassword('kirana2027', stored)).resolves.toBe(false);
  });

  it('never stores the password in plain text', async () => {
    const stored = await hashPassword('kirana2026');

    expect(stored).not.toContain('kirana2026');
    expect(stored.startsWith('scrypt$')).toBe(true);
  });

  it('salts each hash so the same password hashes differently', async () => {
    const first = await hashPassword('kirana2026');
    const second = await hashPassword('kirana2026');

    expect(first).not.toBe(second);
    await expect(verifyPassword('kirana2026', first)).resolves.toBe(true);
    await expect(verifyPassword('kirana2026', second)).resolves.toBe(true);
  });

  it('rejects malformed stored hashes', async () => {
    await expect(verifyPassword('kirana2026', '')).resolves.toBe(false);
    await expect(verifyPassword('kirana2026', 'bcrypt$10$abc$def')).resolves.toBe(false);
    await expect(verifyPassword('kirana2026', 'scrypt$notanumber$8$1$abc$def')).resolves.toBe(
      false,
    );
  });

  it('treats canonically equivalent unicode the same', async () => {
    const stored = await hashPassword('Kārā2026');
    // Same text typed with combining macrons instead of precomposed letters.
    const decomposed = 'Ka\u0304ra\u03042026';

    await expect(verifyPassword(decomposed, stored)).resolves.toBe(true);
  });
});