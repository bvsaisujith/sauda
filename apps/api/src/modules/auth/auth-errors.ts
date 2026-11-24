import type { AuthErrorCode } from './types.js';

const DEFAULT_STATUS: Record<AuthErrorCode, number> = {
  'shop-exists': 409,
  'invalid-credentials': 401,
  locked: 423,
  unauthorized: 401,
};

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number;
  readonly retryAfterSeconds: number | undefined;

  constructor(code: AuthErrorCode, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.status = DEFAULT_STATUS[code];
    this.retryAfterSeconds = retryAfterSeconds;
  }

  static is(error: unknown): error is AuthError {
    return error instanceof AuthError;
  }
}