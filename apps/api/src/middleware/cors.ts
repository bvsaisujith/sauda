import type { NextFunction, Request, Response } from 'express';
import { env } from '../config.js';

export function cors(request: Request, response: Response, next: NextFunction): void {
  const origin = request.header('origin');
  const allowed = new Set([
    env.APP_ORIGIN,
    'https://dash.sauda.thedeploymentlab.app',
    'https://sauda-dash.vercel.app',
    'https://localhost',
    'http://localhost',
    'capacitor://localhost',
    'http://127.0.0.1:5174',
    'https://api.sauda.thedeploymentlab.app',
  ]);

  if (origin && allowed.has(origin)) {
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('vary', 'origin');
  }

  response.setHeader('access-control-allow-headers', 'authorization, content-type, accept');
  response.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');

  if (request.method === 'OPTIONS') {
    response.status(204).end();
    return;
  }

  next();
}
