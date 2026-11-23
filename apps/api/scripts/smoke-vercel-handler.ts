import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import handler from '../../../api/index.js';

const server = createServer(handler);
server.listen(0);
await once(server, 'listening');
const { port } = server.address() as AddressInfo;

try {
  const origin = 'https://localhost';
  const health = await fetch(`http://127.0.0.1:${port}/health`, {
    headers: { origin },
  });

  console.log(JSON.stringify({
    status: health.status,
    cors: health.headers.get('access-control-allow-origin'),
    body: await health.json(),
  }));
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
