import express, { type Express } from 'express';
import { errorHandler } from './middleware/error-handler.js';
import { requireAuth } from './middleware/require-auth.js';
import { createPrivateAuthRouter, createPublicAuthRouter } from './routes/auth-routes.js';
import { createSttRouter } from './routes/stt-routes.js';
import { healthPayload } from './health.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');

  // Voice uploads carry a base64 audio clip, so they need a much larger body
  // limit than ordinary JSON. Mounting the router before the global parser
  // keeps that allowance scoped to voice routes only.
  app.use('/voice', express.json({ limit: '10mb' }), requireAuth, createSttRouter());

  app.use(express.json({ limit: '64kb' }));

  app.get('/health', (_request, response) => {
    response.json(healthPayload());
  });

  // Only health, setup and unlock are reachable without a device token.
  app.use('/auth', createPublicAuthRouter());
  app.use('/auth', requireAuth, createPrivateAuthRouter());

  app.use((request, response) => {
    response
      .status(404)
      .json({ code: 'not-found', message: `No route for ${request.method} ${request.path}` });
  });

  app.use(errorHandler);

  return app;
}
