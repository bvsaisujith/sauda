import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AuthError } from '../modules/auth/public.js';
import { ItemError } from '../modules/items/public.js';
import { StockError } from '../modules/stock/public.js';
import { HttpError } from './http-error.js';
import { ProviderHttpError } from '../providers/llm.js';

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

  if (error instanceof ItemError || error instanceof StockError) {
    response.status(error.status).json({ code: error.code, message: error.message });
    return;
  }

  if (error instanceof HttpError) {
    response.status(error.status).json({ code: error.code, message: error.message });
    return;
  }

  if (error instanceof ProviderHttpError) {
    response.status(502).json({
      code: 'provider-failed',
      message: `The ${error.provider.toUpperCase()} provider rejected the request`,
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

  if ((error as BodyParseError | null)?.type === 'entity.too.large') {
    response.status(413).json({ code: 'payload-too-large', message: 'Request body is too large' });
    return;
  }

  console.error(error);
  response.status(500).json({ code: 'internal-error', message: 'Something went wrong' });
}
