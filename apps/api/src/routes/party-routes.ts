import { Router } from 'express';
import {
  partyInputSchema,
  partyTypeSchema,
  partyUpdateSchema,
  type PartyType,
  type PartyWithBalanceDto,
} from '@sauda/shared';
import { actorOf } from '../middleware/actor.js';
import { billsService, type BillsService } from '../modules/bills/public.js';
import { partiesService, type PartiesService } from '../modules/parties/public.js';

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export function createPartyRouter(
  parties: PartiesService = partiesService,
  bills: BillsService = billsService,
): Router {
  const router = Router();

  router.get('/', async (request, response) => {
    const { shopId } = actorOf(request);
    const typeValue = optionalString(request.query.type);
    const type: PartyType | undefined =
      typeValue === undefined ? undefined : partyTypeSchema.parse(typeValue);
    const search = optionalString(request.query.search)?.toLowerCase();

    const list = await parties.list(shopId, type === undefined ? {} : { type });
    const balances = await bills.outstandingByParty(shopId);

    const partiesWithBalances: PartyWithBalanceDto[] = list
      .filter((party) =>
        search === undefined
          ? true
          : party.name.toLowerCase().includes(search) ||
            (party.phone ?? '').toLowerCase().includes(search),
      )
      .map((party) => {
        const balance = balances.get(party.id);
        return {
          ...party,
          receivablePaise: balance?.receivablePaise ?? 0,
          payablePaise: balance?.payablePaise ?? 0,
        };
      });

    response.json({ parties: partiesWithBalances });
  });

  router.get('/:partyId', async (request, response) => {
    const { shopId } = actorOf(request);
    const party = await parties.get(shopId, request.params.partyId);
    const balances = await bills.outstandingByParty(shopId);
    const balance = balances.get(party.id);
    const partyBills = await bills.list(shopId, { partyId: party.id });

    response.json({
      party: {
        ...party,
        receivablePaise: balance?.receivablePaise ?? 0,
        payablePaise: balance?.payablePaise ?? 0,
      },
      bills: partyBills.map((bill) => ({ ...bill, partyName: party.name })),
    });
  });

  router.post('/', async (request, response) => {
    const actor = actorOf(request);
    const input = partyInputSchema.parse(request.body);
    const party = await parties.create(actor, input);

    response.status(201).json({
      party: { ...party, receivablePaise: 0, payablePaise: 0 },
    });
  });

  router.patch('/:partyId', async (request, response) => {
    const actor = actorOf(request);
    const patch = partyUpdateSchema.parse(request.body);
    const party = await parties.update(actor, request.params.partyId, patch);

    response.json({ party });
  });

  router.delete('/:partyId', async (request, response) => {
    const actor = actorOf(request);
    await parties.archive(actor, request.params.partyId);
    response.status(204).end();
  });

  return router;
}
