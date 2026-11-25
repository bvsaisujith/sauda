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

  await prisma.stockMovement.deleteMany({ where: itemScope });
  await prisma.stockBatch.deleteMany({ where: itemScope });
  await prisma.item.deleteMany({ where: { shopId: scope } });
  await prisma.auditEntry.deleteMany({ where: { shopId: scope } });
  await prisma.deviceToken.deleteMany({ where: { owner: { shopId: scope } } });
  await prisma.owner.deleteMany({ where: { shopId: scope } });
  await prisma.shop.deleteMany({ where: { id: scope } });
}

async function staleSmokeShops(): Promise<string[]> {
  const shops = await db().shop.findMany({
    where: {
      OR: [{ loginKey: { startsWith: 'items smoke ' } }, { loginKey: { startsWith: 'stock smoke ' } }],
    },
    select: { id: true },
  });

  return shops.map((shop) => shop.id);
}

interface ItemBody {
  item: { id: string; name: string; sellPricePaise: number; stockOnHand: number };
}

interface StockBody {
  movement: { type: string; quantity: number; unitCostPaise: number | null };
  onHand: number;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the items smoke test against production');
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
      body: { shopName: `Items Smoke ${run}`, password: 'kirana2026' },
    });
    check('shop signs up', signUp.status === 201, signUp);
    const session = signUp.body as { token: string; shop: { id: string } };
    created.push(session.shop.id);
    const token = session.token;

    const guarded = await call(base, '/items');
    check('items need a token', guarded.status === 401, guarded);

    const createItem = await call(base, '/items', {
      method: 'POST',
      token,
      body: {
        name: 'Tata Salt 1kg',
        baseUnit: 'packet',
        sellPricePaise: 2800,
        buyPricePaise: 2500,
        reorderLevel: 6,
        gstRate: 5,
      },
    });
    check('an item is created', createItem.status === 201, createItem);
    const item = (createItem.body as ItemBody).item;
    check('a new item starts empty', item.stockOnHand === 0, createItem);

    const duplicate = await call(base, '/items', {
      method: 'POST',
      token,
      body: { name: 'Tata Salt 1kg', baseUnit: 'packet', sellPricePaise: 1, buyPricePaise: 1 },
    });
    check('a duplicate name is refused', duplicate.status === 409, duplicate);

    const badPrice = await call(base, '/items', {
      method: 'POST',
      token,
      body: { name: 'Loose Rice', baseUnit: 'kg', sellPricePaise: -1, buyPricePaise: 100 },
    });
    check('a negative price is refused', badPrice.status === 400, badPrice);

    const receive = await call(base, '/stock/receive', {
      method: 'POST',
      token,
      body: { itemId: item.id, quantity: 12, expiryDate: '2027-03-31' },
    });
    check('stock is received', receive.status === 201, receive);
    const received = receive.body as StockBody;
    check('receipt defaults to the buy price', received.movement.unitCostPaise === 2500, receive);
    check('stock on hand counts the receipt', received.onHand === 12, receive);

    const adjustDown = await call(base, '/stock/adjust', {
      method: 'POST',
      token,
      body: { itemId: item.id, delta: -2, reason: 'damaged packets' },
    });
    check('stock goes down by an adjustment', (adjustDown.body as StockBody).onHand === 10, adjustDown);

    const tooFar = await call(base, '/stock/adjust', {
      method: 'POST',
      token,
      body: { itemId: item.id, delta: -100, reason: 'typo' },
    });
    check('an adjustment below zero is refused', tooFar.status === 409, tooFar);
    check(
      'the refusal says how much is left',
      String((tooFar.body as { message: string }).message).includes('10 packet'),
      tooFar,
    );

    const adjustUp = await call(base, '/stock/adjust', {
      method: 'POST',
      token,
      body: { itemId: item.id, delta: 5, reason: 'found a carton' },
    });
    check('stock goes up by an adjustment', (adjustUp.body as StockBody).onHand === 15, adjustUp);

    const list = await call(base, '/items', { token });
    const listed = (list.body as { items: { id: string; stockOnHand: number }[] }).items;
    check('the list shows stock on hand', listed[0]?.stockOnHand === 15, list);

    const movements = await call(base, `/stock/movements?itemId=${item.id}`, { token });
    check(
      'every movement is recorded',
      (movements.body as { movements: unknown[] }).movements.length === 3,
      movements,
    );

    const reprice = await call(base, `/items/${item.id}`, {
      method: 'PATCH',
      token,
      body: { sellPricePaise: 3000 },
    });
    check('a price can be changed', reprice.status === 200, reprice);
    check(
      'the new price is returned',
      (reprice.body as ItemBody).item.sellPricePaise === 3000,
      reprice,
    );

    const secondSignUp = await call(base, '/auth/signup', {
      method: 'POST',
      body: { shopName: `Stock Smoke ${run}`, password: 'second2026' },
    });
    const secondToken = (secondSignUp.body as { token: string }).token;
    created.push((secondSignUp.body as { shop: { id: string } }).shop.id);

    const otherShop = await call(base, `/items/${item.id}`, { token: secondToken });
    check("another shop cannot read this item", otherShop.status === 404, otherShop);

    const otherReceive = await call(base, '/stock/receive', {
      method: 'POST',
      token: secondToken,
      body: { itemId: item.id, quantity: 1 },
    });
    check("another shop cannot add stock to it", otherReceive.status === 404, otherReceive);

    const archive = await call(base, `/items/${item.id}`, { method: 'DELETE', token });
    check('an item can be archived', archive.status === 204, archive);

    const afterArchive = await call(base, '/items', { token });
    check(
      'archived items leave the list',
      (afterArchive.body as { items: unknown[] }).items.length === 0,
      afterArchive,
    );

    const receiveArchived = await call(base, '/stock/receive', {
      method: 'POST',
      token,
      body: { itemId: item.id, quantity: 1 },
    });
    check('an archived item takes no stock', receiveArchived.status === 409, receiveArchived);
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
