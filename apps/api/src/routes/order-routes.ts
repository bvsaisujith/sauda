import { Router } from 'express';
import {
  orderInputSchema,
  orderStatusSchema,
  orderUpdateSchema,
  partyTypeSchema,
  type OrderDto,
  type OrderWithPartyDto,
  type PartyType,
} from '@sauda/shared';
import { actorOf } from '../middleware/actor.js';
import { billsService, type BillsService } from '../modules/bills/public.js';
import { itemsService, type ItemsService } from '../modules/items/public.js';
import { ordersService, type OrdersService } from '../modules/orders/public.js';
import { partiesService, type PartiesService } from '../modules/parties/public.js';

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export function createOrderRouter(
  orders: OrdersService = ordersService,
  parties: PartiesService = partiesService,
  items: ItemsService = itemsService,
  bills: BillsService = billsService,
): Router {
  const router = Router();

  async function compose(shopId: string, order: OrderDto): Promise<OrderWithPartyDto> {
    const party = await parties.get(shopId, order.partyId);
    const itemList = await items.list(shopId, { includeArchived: true });
    const itemNames = Object.fromEntries(itemList.map((item) => [item.id, item.name]));

    return { ...order, partyName: party.name, itemNames };
  }

  router.get('/', async (request, response) => {
    const { shopId } = actorOf(request);
    const typeValue = optionalString(request.query.type);
    const statusValue = optionalString(request.query.status);
    const search = optionalString(request.query.search)?.toLowerCase();
    const partyId = optionalString(request.query.partyId);

    const type: PartyType | undefined =
      typeValue === undefined ? undefined : partyTypeSchema.parse(typeValue);

    const list = await orders.list(shopId, {
      ...(type === undefined ? {} : { type }),
      ...(statusValue === undefined ? {} : { status: orderStatusSchema.parse(statusValue) }),
      ...(partyId === undefined ? {} : { partyId }),
    });

    const composed = await Promise.all(list.map((order) => compose(shopId, order)));

    response.json({
      orders: composed.filter((order) =>
        search === undefined ? true : order.partyName.toLowerCase().includes(search),
      ),
    });
  });

  router.get('/:orderId', async (request, response) => {
    const { shopId } = actorOf(request);
    const order = await orders.get(shopId, request.params.orderId);
    response.json({ order: await compose(shopId, order) });
  });

  router.post('/', async (request, response) => {
    const actor = actorOf(request);
    const input = orderInputSchema.parse(request.body);
    const result = await orders.create(actor, input);
    const order = await compose(actor.shopId, result.order);

    response.status(201).json({
      order,
      ...(result.bill === null ? {} : { bill: await composeBill(actor.shopId, result.bill) }),
    });
  });

  router.patch('/:orderId', async (request, response) => {
    const actor = actorOf(request);
    const patch = orderUpdateSchema.parse(request.body);
    const order = await orders.update(actor, request.params.orderId, patch);
    response.json({ order: await compose(actor.shopId, order) });
  });

  router.post('/:orderId/fulfil', async (request, response) => {
    const actor = actorOf(request);
    const bill = await orders.fulfil(actor, request.params.orderId);
    response.json({ bill: await composeBill(actor.shopId, bill) });
  });

  router.delete('/:orderId', async (request, response) => {
    const actor = actorOf(request);
    await orders.remove(actor, request.params.orderId);
    response.status(204).end();
  });

  async function composeBill(shopId: string, bill: Awaited<ReturnType<BillsService['createForOrder']>>) {
    const party = await parties.get(shopId, bill.partyId);
    const payments = (await bills.get(shopId, bill.id)).payments;
    return { ...bill, partyName: party.name, payments };
  }

  return router;
}
