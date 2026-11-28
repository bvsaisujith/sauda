import express, { type Express } from 'express';
import { errorHandler } from './middleware/error-handler.js';
import { requireAuth } from './middleware/require-auth.js';
import { createPrivateAuthRouter, createPublicAuthRouter } from './routes/auth-routes.js';
import { createItemRouter } from './routes/item-routes.js';
import { createStockRouter } from './routes/stock-routes.js';
import { createSttRouter } from './routes/stt-routes.js';
import { createPartyRouter } from './routes/party-routes.js';
import { createOrderRouter } from './routes/order-routes.js';
import { createBillRouter } from './routes/bill-routes.js';
import { createPaymentRouter } from './routes/payment-routes.js';
import { createDashboardRouter } from './routes/dashboard-routes.js';
import { createAuditRouter } from './routes/audit-routes.js';
import { cors } from './middleware/cors.js';
import { securityHeaders } from './middleware/security-headers.js';
import { healthPayload } from './health.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(cors);

  // Voice uploads carry a base64 audio clip, so they need a much larger body
  // limit than ordinary JSON. Mounting the router before the global parser
  // keeps that allowance scoped to voice routes only.
  app.use('/voice', express.json({ limit: '10mb' }), requireAuth, createSttRouter());

  app.use(express.json({ limit: '64kb' }));

  app.get('/health', (_request, response) => {
    response.json(healthPayload());
  });

  // Only health, sign up and sign in are reachable without a device token.
  app.use('/auth', createPublicAuthRouter());
  app.use('/auth', requireAuth, createPrivateAuthRouter());

  app.use('/items', requireAuth, createItemRouter());
  app.use('/stock', requireAuth, createStockRouter());
  app.use('/parties', requireAuth, createPartyRouter());
  app.use('/orders', requireAuth, createOrderRouter());
  app.use('/bills', requireAuth, createBillRouter());
  app.use('/payments', requireAuth, createPaymentRouter());
  app.use('/dashboard', requireAuth, createDashboardRouter());
  app.use('/audit', requireAuth, createAuditRouter());

  app.use((request, response) => {
    response
      .status(404)
      .json({ code: 'not-found', message: `No route for ${request.method} ${request.path}` });
  });

  app.use(errorHandler);

  return app;
}
