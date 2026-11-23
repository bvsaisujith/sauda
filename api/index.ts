import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../apps/api/src/express-app.js';

const app = createApp();

export default function handler(request: IncomingMessage, response: ServerResponse): void {
  app(request, response);
}
