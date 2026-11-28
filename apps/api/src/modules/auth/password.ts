import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// Tests hash dozens of passwords, so they use a cheaper cost. The parameters
// travel inside every stored hash, so verification always follows the cost a
// hash was created with and a test hash can never be mistaken for a live one.
const COST = process.env.NODE_ENV === 'test' ? 1 << 12 : 1 << 15;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 128 * 1024 * 1024;
const ALGORITHM = 'scrypt';

/**
 * Passwords are stretched with scrypt and a per-owner random salt. The cost
 * parameters travel with the hash so they can be raised later without
 * invalidating existing owners.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELISM,
    maxmem: MAX_MEMORY,
  });

  return [
    ALGORITHM,
    COST,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');

  if (parts.length !== 6 || parts[0] !== ALGORITHM) {
    return false;
  }

  const cost = Number(parts[1]);
  const blockSize = Number(parts[2]);
  const parallelism = Number(parts[3]);
  const salt = Buffer.from(parts[4] ?? '', 'base64url');
  const expected = Buffer.from(parts[5] ?? '', 'base64url');

  if (
    !Number.isInteger(cost) ||
    !Number.isInteger(blockSize) ||
    !Number.isInteger(parallelism) ||
    salt.length === 0 ||
    expected.length === 0 ||
    cost > 1 << 20
  ) {
    return false;
  }

  try {
    const derived = await scryptAsync(password.normalize('NFKC'), salt, expected.length, {
      N: cost,
      r: blockSize,
      p: parallelism,
      maxmem: MAX_MEMORY,
    });

    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}