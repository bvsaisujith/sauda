import { createHash, randomBytes } from 'node:crypto';

const PREFIX = 'sauda_';

export interface TokenPair {
  /** Returned to the device once and never stored by the server. */
  raw: string;
  /** Stored in Postgres so a database leak cannot be replayed. */
  hash: string;
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

export function generateToken(): TokenPair {
  const raw = `${PREFIX}${randomBytes(32).toString('base64url')}`;
  return { raw, hash: hashToken(raw) };
}

export function looksLikeToken(value: string): boolean {
  return value.startsWith(PREFIX) && value.length > PREFIX.length + 20;
}
