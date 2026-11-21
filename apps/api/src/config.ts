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
    LLM_BASE_URL: z.url().default('https://openrouter.ai/api/v1'),
    LLM_API_KEY: z.string().min(1).optional(),
    LLM_MODEL: z.string().min(1).optional(),
    STT_BASE_URL: z.url().default('https://api.sarvam.ai'),
    STT_API_KEY: z.string().min(1).optional(),
    STT_MODEL: z.string().min(1).default('saarika:v2.5'),
    STT_LANGUAGES: z.string().default('hi,bn,ta,te,kn,ml,mr,gu,pa,or,as,ur,ne,sa,ks,sd,kok,mai,brx,doi,mni,sat'),
  })
  .superRefine((value, context) => {
    if (!value.DATABASE_URL) {
      context.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL is required',
      });
    }

    if (value.NODE_ENV !== 'test') {
      if (!value.LLM_API_KEY) {
        context.addIssue({
          code: 'custom',
          path: ['LLM_API_KEY'],
          message: 'LLM_API_KEY is required outside test mode',
        });
      }
      if (!value.LLM_MODEL) {
        context.addIssue({
          code: 'custom',
          path: ['LLM_MODEL'],
          message: 'LLM_MODEL is required outside test mode',
        });
      }
      if (!value.STT_API_KEY) {
        context.addIssue({
          code: 'custom',
          path: ['STT_API_KEY'],
          message: 'STT_API_KEY is required outside test mode',
        });
      }
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
