import { describe, expect, it } from 'vitest';
import { generateToken, hashToken, looksLikeToken } from './tokens.js';

describe('device tokens', () => {
  it('generates unique tokens and stores only a hash', () => {
    const first = generateToken();
    const second = generateToken();

    expect(first.raw).not.toBe(second.raw);
    expect(first.hash).toBe(hashToken(first.raw));
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.raw).not.toBe(first.hash);
    expect(looksLikeToken(first.raw)).toBe(true);
  });

  it('rejects short or foreign values before a database lookup', () => {
    expect(looksLikeToken('')).toBe(false);
    expect(looksLikeToken('sauda_short')).toBe(false);
    expect(looksLikeToken('tok_abcdefghijklmnopqrstuvwxyz')).toBe(false);
  });
});
