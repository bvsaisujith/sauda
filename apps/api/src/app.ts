import express, { type Express } from 'express';
import { healthPayload } from './health.js';

export function createApp(): Express {
  const app = express();

  app.use(express.json());

  app.get('/health', (_request, response) => {
    response.json(healthPayload());
  });

  return app;
}
