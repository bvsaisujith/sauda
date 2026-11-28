import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/express-app.js';
import { closeDb, db } from '../src/db.js';

interface Result {
  status: number;
  body: unknown;
}

async function call(
  base: string,
  path: string,
  init: { method?: string; token?: string; body?: unknown } = {},
): Promise<Result> {
  const response = await fetch(`${base}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(init.token === undefined ? {} : { authorization: `Bearer ${init.token}` }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });

  const text = await response.text();
  let body: unknown = null;

  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return { status: response.status, body };
}

function check(label: string, condition: boolean, detail: unknown): void {
  if (!condition) {
    throw new Error(`${label} failed: ${JSON.stringify(detail)}`);
  }
  console.log(`ok  ${label}`);
}

/**
 * Removes only the shops this smoke test creates, in dependency order, so a
 * shared database keeps every real account and its stock history.
 */
async function deleteShops(shopIds: string[]): Promise<void> {
  if (shopIds.length === 0) {
    return;
  }

  const prisma = db();
  const scope = { in: shopIds };
  const itemScope = { item: { shopId: scope } };

  await prisma.billPayment.deleteMany({ where: { bill: { shopId: scope } } });
  await prisma.bill.deleteMany({ where: { shopId: scope } });
  await prisma.orderLine.deleteMany({ where: { order: { shopId: scope } } });
  await prisma.order.deleteMany({ where: { shopId: scope } });
  await prisma.stockMovement.deleteMany({ where: itemScope });
  await prisma.stockBatch.deleteMany({ where: itemScope });
  await prisma.item.deleteMany({ where: { shopId: scope } });
  await prisma.party.deleteMany({ where: { shopId: scope } });
  await prisma.auditEntry.deleteMany({ where: { shopId: scope } });
  await prisma.deviceToken.deleteMany({ where: { owner: { shopId: scope } } });
  await prisma.owner.deleteMany({ where: { shopId: scope } });
  await prisma.shop.deleteMany({ where: { id: scope } });
}

async function staleSmokeShops(): Promise<string[]> {
  const shops = await db().shop.findMany({
    where: {
      OR: [
        { loginKey: { startsWith: 'orders smoke ' } },
        { loginKey: { startsWith: 'bills smoke ' } },
      ],
    },
    select: { id: true },
  });

  return shops.map((shop) => shop.id);
}

interface ItemBody {
  item: { id: string; name: string; stockOnHand: number };
}

interface PartyBody {
  party: { id: string; name: string; receivablePaise: number };
}

interface OrderBody {
  order: { id: string; status: string; totalPaise: number; partyName: string };
  bill?: { id: string; billNumber: string };
}

interface BillBody {
  bill: {
    id: string;
    status: string;
    totalPaise: number;
    paidPaise: number;
    balancePaise: number;
    closed: boolean;
    payments: { id: string; amountPaise: number; version: number }[];
    order: { id: string; lines: unknown[] };
  };
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the orders smoke test against production');
  }

  const run = Date.now().toString(36);
  const created: string[] = [];

  await deleteShops(await staleSmokeShops());

  const server = createApp().listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  try {
    const signUp = await call(base, '/auth/signup', {
      method: 'POST',
      body: { shopName: `Orders Smoke ${run}`, password: 'kirana2026' },
    });
    check('shop signs up', signUp.status === 201, signUp);
    const session = signUp.body as { token: string; shop: { id: string } };
    created.push(session.shop.id);
    const token = session.token;

    const createItem = await call(base, '/items', {
      method: 'POST',
      token,
      body: {
        name: 'Loose Rice',
        baseUnit: 'kg',
        sellPricePaise: 5000,
        buyPricePaise: 4000,
        reorderLevel: 5,
        gstRate: 0,
      },
    });
    check('an item is created', createItem.status === 201, createItem);
    const item = (createItem.body as ItemBody).item;

    const receive = await call(base, '/stock/receive', {
      method: 'POST',
      token,
      body: { itemId: item.id, quantity: 50 },
    });
    check('opening stock is received', receive.status === 201, receive);

    const createCustomer = await call(base, '/parties', {
      method: 'POST',
      token,
      body: { type: 'customer', name: `Ramesh ${run}`, phone: '9876543210' },
    });
    check('a customer is created', createCustomer.status === 201, createCustomer);
    const customer = (createCustomer.body as PartyBody).party;

    const duplicateParty = await call(base, '/parties', {
      method: 'POST',
      token,
      body: { type: 'customer', name: `ramesh ${run}` },
    });
    check('a duplicate party is refused', duplicateParty.status === 409, duplicateParty);

    const badParty = await call(base, '/parties', {
      method: 'POST',
      token,
      body: { type: 'customer', name: 'X', phone: 'call me' },
    });
    check('a malformed phone is refused', badParty.status === 400, badParty);

    const createOrder = await call(base, '/orders', {
      method: 'POST',
      token,
      body: {
        type: 'customer',
        partyId: customer.id,
        orderDate: '2026-11-26',
        lines: [{ itemId: item.id, quantity: 10, ratePaise: 5000 }],
        fulfil: false,
      },
    });
    check('an order is created as pending', createOrder.status === 201, createOrder);
    const order = (createOrder.body as OrderBody).order;
    check('the order total is the line total', order.totalPaise === 50_000, createOrder);
    check('the order carries the party name', order.partyName === customer.name, createOrder);

    const pendingList = await call(base, '/orders?type=customer&status=pending', { token });
    check(
      'the pending list shows the order',
      (pendingList.body as { orders: unknown[] }).orders.length === 1,
      pendingList,
    );

    const prematureStock = await call(base, '/stock/summary', { token });
    check(
      'a pending order has not moved stock',
      (prematureStock.body as { summary: { itemId: string; onHand: number }[] }).summary[0]?.onHand ===
        50,
      prematureStock,
    );

    const fulfil = await call(base, `/orders/${order.id}/fulfil`, { method: 'POST', token });
    check('fulfilling creates a bill', fulfil.status === 200, fulfil);
    const billId = (fulfil.body as { bill: { id: string } }).bill.id;

    const afterFulfil = await call(base, '/stock/summary', { token });
    check(
      'fulfilling a customer order sends stock out',
      (afterFulfil.body as { summary: { itemId: string; onHand: number }[] }).summary[0]?.onHand ===
        40,
      afterFulfil,
    );

    const doubleFulfil = await call(base, `/orders/${order.id}/fulfil`, {
      method: 'POST',
      token,
    });
    check('fulfilling twice succeeds as a no-op', doubleFulfil.status === 200, doubleFulfil);
    check(
      'the duplicate fulfil returns the same bill',
      (doubleFulfil.body as { bill: { id: string } }).bill.id === billId,
      doubleFulfil,
    );

    const billList = await call(base, '/bills', { token });
    check(
      'the shop has exactly one bill',
      (billList.body as { bills: unknown[] }).bills.length === 1,
      billList,
    );

    const stockAfterDouble = await call(base, '/stock/summary', { token });
    check(
      'the duplicate fulfil moved no stock',
      (stockAfterDouble.body as { summary: { itemId: string; onHand: number }[] }).summary[0]
        ?.onHand === 40,
      stockAfterDouble,
    );

    const billDetail = await call(base, `/bills/${billId}`, { token });
    check('the bill starts unpaid', (billDetail.body as BillBody).bill.status === 'unpaid', billDetail);
    check(
      'the bill exposes the order lines',
      (billDetail.body as BillBody).bill.order.lines.length === 1,
      billDetail,
    );

    const partial = await call(base, `/bills/${billId}/payments`, {
      method: 'POST',
      token,
      body: { amountPaise: 20_000, paidOn: '2026-11-26', mode: 'upi' },
    });
    check('a partial payment is accepted', partial.status === 201, partial);
    const partialBill = (partial.body as BillBody).bill;
    check('the status becomes partial', partialBill.status === 'partial', partial);
    check('the balance drops', partialBill.balancePaise === 30_000, partial);

    const full = await call(base, `/bills/${billId}/payments`, {
      method: 'POST',
      token,
      body: { amountPaise: 30_000, paidOn: '2026-11-26', mode: 'cash' },
    });
    check('the closing payment is accepted', full.status === 201, full);
    check('the bill is paid', (full.body as BillBody).bill.status === 'paid', full);
    check('the paid bill is closed', (full.body as BillBody).bill.closed === true, full);

    const closedPayment = await call(base, `/bills/${billId}/payments`, {
      method: 'POST',
      token,
      body: { amountPaise: 1_000, paidOn: '2026-11-26', mode: 'cash' },
    });
    check('a closed bill takes no payment', closedPayment.status === 409, closedPayment);

    const reopen = await call(base, `/bills/${billId}/reopen`, { method: 'POST', token });
    check('the bill can be reopened', reopen.status === 200, reopen);
    check('a reopened bill is editable', (reopen.body as BillBody).bill.closed === false, reopen);

    const payments = (reopen.body as BillBody).bill.payments;
    const first = payments[0]!;
    const stale = await call(base, `/payments/${first.id}`, {
      method: 'PATCH',
      token,
      body: { amountPaise: 5_000, version: first.version + 3 },
    });
    check('a stale payment edit is refused', stale.status === 409, stale);

    const edited = await call(base, `/payments/${first.id}`, {
      method: 'PATCH',
      token,
      body: { amountPaise: 5_000, version: first.version },
    });
    check('a payment can be edited', edited.status === 200, edited);
    check('the status recalculates', (edited.body as BillBody).bill.status === 'partial', edited);

    const removed = await call(base, `/payments/${first.id}`, { method: 'DELETE', token });
    check('a payment can be deleted', removed.status === 200, removed);
    check(
      'the balance returns after a delete',
      (removed.body as BillBody).bill.paidPaise === 30_000,
      removed,
    );

    const summary = await call(base, '/dashboard/summary', { token });
    check('the dashboard summarises today', summary.status === 200, summary);
    const totals = summary.body as {
      todaySalesPaise: number;
      receivablePaise: number;
      billCounts: { unpaid: number; partial: number; paid: number };
    };
    check('today sales include the bill', totals.todaySalesPaise === 50_000, summary);
    check('the bill is still receivable', totals.receivablePaise === 20_000, summary);

    const partyDetail = await call(base, `/parties/${customer.id}`, { token });
    check(
      'the party shows its outstanding balance',
      (partyDetail.body as PartyBody).party.receivablePaise === 20_000,
      partyDetail,
    );
    check(
      'the party lists its bills',
      (partyDetail.body as { bills: unknown[] }).bills.length === 1,
      partyDetail,
    );

    const history = await call(base, `/audit?entityType=Bill&entityId=${billId}`, { token });
    check(
      'the bill history records the changes',
      (history.body as { entries: unknown[] }).entries.length >= 4,
      history,
    );

    const crossShop = await call(base, '/auth/signup', {
      method: 'POST',
      body: { shopName: `Bills Smoke ${run}`, password: 'second2026' },
    });
    const otherToken = (crossShop.body as { token: string }).token;
    created.push((crossShop.body as { shop: { id: string } }).shop.id);

    const otherShopBill = await call(base, `/bills/${billId}`, { token: otherToken });
    check('another shop cannot read the bill', otherShopBill.status === 404, otherShopBill);

    const archiveOrder = await call(base, `/orders/${order.id}`, { method: 'DELETE', token });
    check('a fulfilled order can be deleted', archiveOrder.status === 204, archiveOrder);

    const afterDelete = await call(base, '/stock/summary', { token });
    check(
      'deleting the order reverses the stock effect',
      (afterDelete.body as { summary: { itemId: string; onHand: number }[] }).summary[0]?.onHand ===
        50,
      afterDelete,
    );

    const deletedBill = await call(base, `/bills/${billId}`, { token });
    check('deleting the order removes its bill', deletedBill.status === 404, deletedBill);
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
    await deleteShops([...created, ...(await staleSmokeShops())]);
    await closeDb();
  }
}

main().catch(async (error: unknown) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});