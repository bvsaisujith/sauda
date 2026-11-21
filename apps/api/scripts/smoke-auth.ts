import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
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

async function resetAuthData(): Promise<void> {
  const prisma = db();
  await prisma.deviceToken.deleteMany();
  await prisma.auditEntry.deleteMany();
  await prisma.owner.deleteMany();
  await prisma.shop.deleteMany();
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the auth smoke test against production');
  }

  await resetAuthData();

  const server = createApp().listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  try {
    const health = await call(base, '/health');
    check('health is public', health.status === 200, health);

    const guarded = await call(base, '/auth/me');
    check('me needs a token', guarded.status === 401, guarded);

    const earlyUnlock = await call(base, '/auth/unlock', {
      method: 'POST',
      body: { pin: '4821' },
    });
    check('unlock before setup asks for setup', earlyUnlock.status === 409, earlyUnlock);

    const setup = await call(base, '/auth/setup', {
      method: 'POST',
      body: { shopName: 'Smoke Kirana', pin: '4821' },
    });
    check('setup returns a session', setup.status === 201, setup);
    const session = setup.body as { token: string; shop: { name: string } };
    check('session names the shop', session.shop.name === 'Smoke Kirana', session);

    const secondSetup = await call(base, '/auth/setup', {
      method: 'POST',
      body: { shopName: 'Second', pin: '1111' },
    });
    check('second setup is refused', secondSetup.status === 409, secondSetup);

    const me = await call(base, '/auth/me', { token: session.token });
    check('me returns the owner', me.status === 200, me);

    const wrongPin = await call(base, '/auth/unlock', {
      method: 'POST',
      body: { pin: '0000' },
    });
    check('wrong PIN is rejected', wrongPin.status === 401, wrongPin);

    const unlocked = await call(base, '/auth/unlock', {
      method: 'POST',
      body: { pin: '4821', deviceLabel: 'smoke' },
    });
    check('correct PIN unlocks', unlocked.status === 200, unlocked);
    const second = unlocked.body as { token: string };
    check('a fresh token is issued', second.token !== session.token, unlocked);

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
      await call(base, '/auth/unlock', { method: 'POST', body: { pin: '9999' } });
    }

    const locked = await call(base, '/auth/unlock', {
      method: 'POST',
      body: { pin: '4821' },
    });
    check('PIN locks after five failures', locked.status === 423, locked);
    check('lockout sends Retry-After', locked.headers.has('retry-after'), locked);

    const audit = await db().auditEntry.findMany({
      where: { operation: 'auth.unlock.failed' },
    });
    check('failed attempts are audited', audit.length >= 6, audit.length);
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
    await resetAuthData();
    await closeDb();
  }
}

main().catch(async (error: unknown) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});
