import type { NextFunction, Request, Response } from 'express';
import { authService, type AuthContext } from '../modules/auth/public.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

const BEARER = /^Bearer\s+(\S+)$/i;

export async function requireAuth(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const match = request.header('authorization')?.match(BEARER);
  const token = match?.[1];

  if (!token) {
    response.status(401).json({ code: 'unauthorized', message: 'A device token is required' });
    return;
  }

  try {
    const context = await authService.verifyToken(token);

    if (!context) {
      response
        .status(401)
        .json({ code: 'unauthorized', message: 'Device token is missing, expired or revoked' });
      return;
    }

    request.auth = context;
    next();
  } catch (error) {
    next(error);
  }
}
