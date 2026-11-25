import { Router } from 'express';
import { z } from 'zod';
import {
  stockAdjustRequestSchema,
  stockReceiveRequestSchema,
  type StockMovementDto,
  type StockSummaryDto,
} from '@sauda/shared';
import { actorOf } from '../middleware/actor.js';
import { stockService, type StockService } from '../modules/stock/public.js';

const MOVEMENT_LIMIT = 50;

export function createStockRouter(service: StockService = stockService): Router {
  const router = Router();

  router.get('/summary', async (request, response) => {
    const { shopId } = actorOf(request);
    const onHand = await service.onHandByShop(shopId);
    const summary: StockSummaryDto[] = [...onHand.entries()].map(([itemId, value]) => ({
      itemId,
      onHand: value,
    }));

    response.json({ summary });
  });

  router.get('/movements', async (request, response) => {
    const { shopId } = actorOf(request);
    const itemId = z.string().min(1).parse(request.query.itemId);
    const movements: StockMovementDto[] = await service.listMovements(shopId, itemId, MOVEMENT_LIMIT);
    response.json({ movements });
  });

  router.post('/receive', async (request, response) => {
    const actor = actorOf(request);
    const input = stockReceiveRequestSchema.parse(request.body);
    const result = await service.receive(actor, input);
    response.status(201).json(result);
  });

  router.post('/adjust', async (request, response) => {
    const actor = actorOf(request);
    const input = stockAdjustRequestSchema.parse(request.body);
    const result = await service.adjust(actor, input);
    response.json(result);
  });

  return router;
}
