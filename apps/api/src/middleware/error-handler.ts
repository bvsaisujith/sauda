import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AuthError } from '../modules/auth/public.js';

interface BodyParseError {
  type?: string;
  status?: number;
  body?: unknown;
}

function isBodyParseError(error: unknown): error is BodyParseError {
  const candidate = error as BodyParseError | null;
  return candidate?.type === 'entity.parse.failed';
}

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
): void {
  if (error instanceof AuthError) {
    if (error.retryAfterSeconds !== undefined) {
      response.setHeader('Retry-After', String(error.retryAfterSeconds));
    }

    response.status(error.status).json({
      code: error.code,
      message: error.message,
      ...(error.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: error.retryAfterSeconds }),
    });
    return;
  }

  if (error instanceof ZodError) {
    response.status(400).json({
      code: 'validation-failed',
      message: error.issues
        .map((issue) => {
          const path = issue.path.join('.');
          return path ? `${path}: ${issue.message}` : issue.message;
        })
        .join('; '),
    });
    return;
  }

  if (isBodyParseError(error)) {
    response.status(400).json({ code: 'validation-failed', message: 'Request body is not JSON' });
    return;
  }

  console.error(error);
  response.status(500).json({ code: 'internal-error', message: 'Something went wrong' });
}
