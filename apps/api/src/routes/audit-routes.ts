import { Router } from 'express';
import { z } from 'zod';
import { actorOf } from '../middleware/actor.js';
import { auditService, type AuditService } from '../modules/audit/public.js';

const limitSchema = z.coerce.number().int().positive().max(200).optional();

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export function createAuditRouter(service: AuditService = auditService): Router {
  const router = Router();

  router.get('/', async (request, response) => {
    const { shopId } = actorOf(request);
    const entityType = optionalString(request.query.entityType);
    const entityId = optionalString(request.query.entityId);
    const limit = limitSchema.parse(optionalString(request.query.limit));

    const entries = await service.list(shopId, {
      ...(entityType === undefined ? {} : { entityType }),
      ...(entityId === undefined ? {} : { entityId }),
      ...(limit === undefined ? {} : { limit }),
    });

    response.json({ entries });
  });

  return router;
}
