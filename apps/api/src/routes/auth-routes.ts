import { Router } from 'express';
import { setupRequestSchema, unlockRequestSchema } from '@sauda/shared';
import { AuthError, authService, type AuthService } from '../modules/auth/public.js';

function contextOrThrow(request: { auth?: { tokenId: string } }): { tokenId: string } {
  if (!request.auth) {
    throw new AuthError('unauthorized', 'A device token is required');
  }

  return request.auth;
}

export function createPublicAuthRouter(service: AuthService = authService): Router {
  const router = Router();

  router.post('/setup', async (request, response) => {
    const body = setupRequestSchema.parse(request.body);
    const session = await service.setup(body);
    response.status(201).json(session);
  });

  router.post('/unlock', async (request, response) => {
    const body = unlockRequestSchema.parse(request.body);
    const session = await service.unlock({
      pin: body.pin,
      ...(body.deviceLabel === undefined ? {} : { deviceLabel: body.deviceLabel }),
    });
    response.json(session);
  });

  return router;
}

export function createPrivateAuthRouter(service: AuthService = authService): Router {
  const router = Router();

  router.get('/me', (request, response) => {
    const context = request.auth;

    if (!context) {
      throw new AuthError('unauthorized', 'A device token is required');
    }

    response.json({
      shop: { id: context.shopId, name: context.shopName },
      owner: { id: context.ownerId },
    });
  });

  router.post('/logout', async (request, response) => {
    const { tokenId } = contextOrThrow(request);
    await service.logout(tokenId);
    response.status(204).end();
  });

  return router;
}
