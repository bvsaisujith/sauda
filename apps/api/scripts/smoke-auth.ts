import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/express-app.js';
import { closeDb, db } from '../src/db.js';

interface Result {
  status: number;
  body: unknown;
  headers: Headers;
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

  return { status: response.status, body, headers: response.headers };
}

function check(label: string, condition: boolean, detail: unknown): void {
  if (!condition) {
    throw new Error(`${label} failed: ${JSON.stringify(detail)}`);
  }
  console.log(`ok  ${label}`);
}

/**
 * Only smoke shops are removed. The script used to clear every shop, which
 * was harmless when a single shop could exist but would now delete real
 * accounts on a shared database.
 */
async function deleteShops(shopIds: string[]): Promise<void> {
  if (shopIds.length === 0) {
    return;
  }

  const prisma = db();
  const scope = { in: shopIds };

  await prisma.deviceToken.deleteMany({ where: { owner: { shopId: scope } } });
  await prisma.auditEntry.deleteMany({ where: { shopId: scope } });
  await prisma.owner.deleteMany({ where: { shopId: scope } });
  await prisma.shop.deleteMany({ where: { id: scope } });
}

async function staleSmokeShops(): Promise<string[]> {
  const shops = await db().shop.findMany({
    where: {
      OR: [
        { loginKey: { startsWith: 'smoke kirana ' } },
        { loginKey: { startsWith: 'second shop ' } },
      ],
    },
    select: { id: true },
  });

  return shops.map((shop) => shop.id);
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the auth smoke test against production');
  }

  const run = Date.now().toString(36);
  const firstShop = `Smoke Kirana ${run}`;
  const secondShop = `Second Shop ${run}`;
  const created: string[] = [];

  await deleteShops(await staleSmokeShops());

  const server = createApp().listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  try {
    const health = await call(base, '/health');
    check('health is public', health.status === 200, health);

    const guarded = await call(base, '/auth/me');
    check('me needs a token', guarded.status === 401, guarded);

    const badPassword = await call(base, '/auth/signup', {
      method: 'POST',
      body: { shopName: firstShop, password: 'alllettersonly' },
    });
    check('signup rejects a password with no digit', badPassword.status === 400, badPassword);

    const shortPassword = await call(base, '/auth/signup', {
      method: 'POST',
      body: { shopName: firstShop, password: 'abc1' },
    });
    check('signup rejects a short password', shortPassword.status === 400, shortPassword);

    const signUp = await call(base, '/auth/signup', {
      method: 'POST',
      body: { shopName: firstShop, password: 'kirana2026' },
    });
    check('signup returns a session', signUp.status === 201, signUp);
    const session = signUp.body as { token: string; shop: { id: string; name: string } };
    created.push(session.shop.id);
    check('session names the shop', session.shop.name === firstShop, session);

    const duplicate = await call(base, '/auth/signup', {
      method: 'POST',
      body: { shopName: firstShop.toUpperCase(), password: 'another2026' },
    });
    check('duplicate shop name is refused', duplicate.status === 409, duplicate);

    const me = await call(base, '/auth/me', { token: session.token });
    check('me returns the owner', me.status === 200, me);

    const wrongPassword = await call(base, '/auth/signin', {
      method: 'POST',
      body: { shopName: firstShop, password: 'wrong2026' },
    });
    check('wrong password is rejected', wrongPassword.status === 401, wrongPassword);

    const unknownShop = await call(base, '/auth/signin', {
      method: 'POST',
      body: { shopName: `Nope Kirana ${run}`, password: 'wrong2026' },
    });
    check(
      'unknown shop and wrong password look the same',
      (unknownShop.body as { message: string }).message ===
        (wrongPassword.body as { message: string }).message,
      { unknownShop, wrongPassword },
    );

    const signIn = await call(base, '/auth/signin', {
      method: 'POST',
      body: { shopName: `  ${firstShop.toUpperCase()} `, password: 'kirana2026', deviceLabel: 'smoke' },
    });
    check('sign in ignores shop name case and padding', signIn.status === 200, signIn);
    const second = signIn.body as { token: string };
    check('a fresh token is issued', second.token !== session.token, signIn);

    const logout = await call(base, '/auth/logout', {
      method: 'POST',
      token: session.token,
    });
    check('logout returns 204', logout.status === 204, logout);

    const afterLogout = await call(base, '/auth/me', { token: session.token });
    check('revoked token stops working', afterLogout.status === 401, afterLogout);

    const otherStillWorks = await call(base, '/auth/me', { token: second.token });
    check('other device tokens survive', otherStillWorks.status === 200, otherStillWorks);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await call(base, '/auth/signin', {
        method: 'POST',
        body: { shopName: firstShop, password: 'wrong2026' },
      });
    }

    const locked = await call(base, '/auth/signin', {
      method: 'POST',
      body: { shopName: firstShop, password: 'kirana2026' },
    });
    check('sign in locks after five failures', locked.status === 423, locked);
    check('lockout sends Retry-After', locked.headers.has('retry-after'), locked);

    const audit = await db().auditEntry.findMany({
      where: { operation: 'auth.signin.failed', shopId: session.shop.id },
    });
    check('failed attempts are audited', audit.length >= 5, audit.length);

    const secondShopSignUp = await call(base, '/auth/signup', {
      method: 'POST',
      body: { shopName: secondShop, password: 'second2026' },
    });
    check('a second shop can register', secondShopSignUp.status === 201, secondShopSignUp);
    const secondSession = secondShopSignUp.body as { token: string; shop: { id: string } };
    created.push(secondSession.shop.id);

    const firstMe = await call(base, '/auth/me', { token: second.token });
    const secondMe = await call(base, '/auth/me', { token: secondSession.token });
    check(
      'each shop keeps its own data',
      (firstMe.body as { shop: { id: string } }).shop.id !== secondSession.shop.id,
      { firstMe, secondMe },
    );
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
