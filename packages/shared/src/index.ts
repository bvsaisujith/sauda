import { z } from 'zod';

export * from './auth.js';
export * from './items.js';
export * from './providers.js';
export * from './stock.js';
export * from './voice.js';

export const APP_NAME = 'Sauda';

/** Every route family answers failures with this shape. */
export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  retryAfterSeconds: z.number().int().positive().optional(),
});

export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

export const healthSchema = z.object({
  status: z.literal('ok'),
  service: z.string().min(1),
});

export type Health = z.infer<typeof healthSchema>;
