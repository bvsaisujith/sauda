const base = process.env.SAUDA_API_URL ?? 'https://api.sauda.thedeploymentlab.app';
const shopName = process.env.SAUDA_SHOP_NAME?.trim() ?? 'Sauda Deploy Smoke';
const password = process.env.SAUDA_PASSWORD?.trim() ?? 'deploy2026';

async function call(
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const text = await response.text();
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  return { status: response.status, body: parsed };
}

function check(label: string, condition: boolean, detail: unknown): void {
  if (!condition) {
    throw new Error(`${label} failed: ${JSON.stringify(detail)}`);
  }
  console.log(`ok  ${label}`);
}

async function main(): Promise<void> {
  const health = await call('/health');
  check('health is live', health.status === 200, health);

  const signIn = await call('/auth/signin', { shopName, password });

  if (signIn.status === 200) {
    check('sign in works', true, {});
    return;
  }

  check('sign in reached the auth layer', signIn.status >= 400, signIn);

  const signUp = await call('/auth/signup', { shopName, password });

  if (signUp.status === 201) {
    check('sign up works', true, {});
    return;
  }

  check('sign up was refused for a stated reason', signUp.status >= 400, signUp);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});