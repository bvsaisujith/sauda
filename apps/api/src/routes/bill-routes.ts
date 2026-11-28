import { Router } from 'express';
import {
  billPaymentInputSchema,
  billStatusSchema,
  partyTypeSchema,
  type BillStatus,
  type BillWithPaymentsDto,
  type PartyType,
} from '@sauda/shared';
import { actorOf } from '../middleware/actor.js';
import { itemsService, type ItemsService } from '../modules/items/public.js';
import { billsService, type BillsService } from '../modules/bills/public.js';
import { ordersService, type OrdersService } from '../modules/orders/public.js';
import { partiesService, type PartiesService } from '../modules/parties/public.js';

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

type ComposedBill = BillWithPaymentsDto & { partyName: string };

async function composeBill(
  shopId: string,
  billId: string,
  bills: BillsService,
  parties: PartiesService,
): Promise<ComposedBill> {
  const { bill, payments } = await bills.get(shopId, billId);
  const party = await parties.get(shopId, bill.partyId);

  return { ...bill, payments, partyName: party.name };
}

export function createBillRouter(
  bills: BillsService = billsService,
  parties: PartiesService = partiesService,
  orders: OrdersService = ordersService,
  items: ItemsService = itemsService,
): Router {
  const router = Router();

  router.get('/', async (request, response) => {
    const { shopId } = actorOf(request);
    const statusValue = optionalString(request.query.status);
    const typeValue = optionalString(request.query.type);
    const partyId = optionalString(request.query.partyId);
    const search = optionalString(request.query.search)?.toLowerCase();

    const status: BillStatus | undefined =
      statusValue === undefined ? undefined : billStatusSchema.parse(statusValue);
    const orderType: PartyType | undefined =
      typeValue === undefined ? undefined : partyTypeSchema.parse(typeValue);

    const list = await bills.list(shopId, {
      ...(status === undefined ? {} : { status }),
      ...(orderType === undefined ? {} : { orderType }),
      ...(partyId === undefined ? {} : { partyId }),
    });

    const partyList = await parties.list(shopId);
    const names = new Map(partyList.map((party) => [party.id, party.name]));

    response.json({
      bills: list
        .map((bill) => ({ ...bill, partyName: names.get(bill.partyId) ?? 'Deleted party' }))
        .filter((bill) =>
          search === undefined
            ? true
            : bill.partyName.toLowerCase().includes(search) ||
              bill.billNumber.toLowerCase().includes(search),
        ),
    });
  });

  router.get('/:billId', async (request, response) => {
    const { shopId } = actorOf(request);
    const { bill, payments } = await bills.get(shopId, request.params.billId);
    const party = await parties.get(shopId, bill.partyId);
    const order = await orders.get(shopId, bill.orderId);
    const itemList = await items.list(shopId, { includeArchived: true });
    const itemNames = Object.fromEntries(itemList.map((item) => [item.id, item.name]));

    response.json({
      bill: {
        ...bill,
        payments,
        partyName: party.name,
        order: { ...order, partyName: party.name, itemNames },
      },
    });
  });

  router.post('/:billId/payments', async (request, response) => {
    const actor = actorOf(request);
    const input = billPaymentInputSchema.parse(request.body);
    await bills.addPayment(actor, request.params.billId, input);
    response.status(201).json({ bill: await composeBill(actor.shopId, request.params.billId, bills, parties) });
  });

  router.post('/:billId/reopen', async (request, response) => {
    const actor = actorOf(request);
    await bills.reopen(actor, request.params.billId);
    response.json({ bill: await composeBill(actor.shopId, request.params.billId, bills, parties) });
  });

  return router;
}
