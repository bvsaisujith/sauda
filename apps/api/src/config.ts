import { config as loadDotenv } from 'dotenv';

loadDotenv({ quiet: true });
loadDotenv({ path: new URL('../.env', import.meta.url), quiet: true });

import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    APP_ORIGIN: z.string().default('http://localhost:5173'),
    DATABASE_URL: z.string().min(1).optional(),
    DEVICE_TOKEN_DAYS: z.coerce.number().int().min(1).max(3650).default(180),
  })
  .superRefine((value, context) => {
    if (!value.DATABASE_URL) {
      context.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL is required',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment:\n${details}`);
  }

  return parsed.data;
}

export const env: Env = loadEnv();
