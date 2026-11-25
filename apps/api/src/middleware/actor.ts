import type { Request } from 'express';
import { AuthError } from '../modules/auth/public.js';

export interface ActorContext {
  shopId: string;
  ownerId: string;
  source: 'TOUCH' | 'VOICE' | 'SYSTEM';
}

/**
 * Routers mounted behind requireAuth can trust request.auth, but the type is
 * optional. This narrows it once so handlers never repeat the check.
 */
export function actorOf(request: Request, source: ActorContext['source'] = 'TOUCH'): ActorContext {
  if (!request.auth) {
    throw new AuthError('unauthorized', 'A device token is required');
  }

  return {
    shopId: request.auth.shopId,
    ownerId: request.auth.ownerId,
    source,
  };
}
