const base = 'https://sauda.thedeploymentlab.app';
const pin = String(process.env.SAUDA_DEPLOY_PIN ?? '4821');

async function call(path: string, body?: unknown, token?: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const text = await response.text();
  const parsed: unknown = (() => {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  })();
  return { status: response.status, body: parsed };
}

const unlock = await call('/auth/unlock', { pin, deviceLabel: 'deploy-smoke' });
console.log(JSON.stringify({ unlockStatus: unlock.status, unlocked: unlock.status === 200 }));

if (unlock.status === 409) {
  const setup = await call('/auth/setup', { shopName: 'Sauda Deploy Smoke', pin });
  console.log(JSON.stringify({ setupStatus: setup.status, setupSucceeded: setup.status === 201 }));
}
