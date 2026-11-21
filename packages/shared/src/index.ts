import { z } from 'zod';

export * from './auth.js';

export const APP_NAME = 'Sauda';

export const healthSchema = z.object({
  status: z.literal('ok'),
  service: z.string().min(1),
});

export type Health = z.infer<typeof healthSchema>;
