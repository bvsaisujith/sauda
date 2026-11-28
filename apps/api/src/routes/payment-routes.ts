import { Router } from 'express';
import { billPaymentUpdateSchema } from '@sauda/shared';
import { actorOf } from '../middleware/actor.js';
import { billsService, type BillsService } from '../modules/bills/public.js';
import { partiesService, type PartiesService } from '../modules/parties/public.js';

export function createPaymentRouter(
  bills: BillsService = billsService,
  parties: PartiesService = partiesService,
): Router {
  const router = Router();

  router.patch('/:paymentId', async (request, response) => {
    const actor = actorOf(request);
    const patch = billPaymentUpdateSchema.parse(request.body);
    const result = await bills.updatePayment(actor, request.params.paymentId, patch);
    const party = await parties.get(actor.shopId, result.bill.partyId);

    response.json({ bill: { ...result.bill, payments: result.payments, partyName: party.name } });
  });

  router.delete('/:paymentId', async (request, response) => {
    const actor = actorOf(request);
    const result = await bills.deletePayment(actor, request.params.paymentId);
    const party = await parties.get(actor.shopId, result.bill.partyId);

    response.json({ bill: { ...result.bill, payments: result.payments, partyName: party.name } });
  });

  return router;
}
