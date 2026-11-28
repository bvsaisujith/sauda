import { Router } from 'express';
import { actorOf } from '../middleware/actor.js';
import { billsService, type BillsService } from '../modules/bills/public.js';

export function createDashboardRouter(bills: BillsService = billsService): Router {
  const router = Router();

  router.get('/summary', async (request, response) => {
    const { shopId } = actorOf(request);
    response.json(await bills.summary(shopId));
  });

  return router;
}
