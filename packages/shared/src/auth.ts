import { z } from 'zod';

export const pinSchema = z
  .string()
  .regex(/^\d{4,8}$/, 'PIN must be 4 to 8 digits');

export const setupRequestSchema = z.object({
  shopName: z.string().trim().min(1).max(80),
  pin: pinSchema,
});

export const unlockRequestSchema = z.object({
  pin: pinSchema,
  deviceLabel: z.string().trim().min(1).max(80).optional(),
});

export const shopSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const sessionSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.iso.datetime(),
  shop: shopSummarySchema,
  owner: z.object({ id: z.string().min(1) }),
});

export const sessionInfoSchema = sessionSchema.omit({ token: true, expiresAt: true });

export const authErrorSchema = z.object({
  code: z.enum([
    'validation-failed',
    'setup-required',
    'already-setup',
    'invalid-pin',
    'locked',
    'unauthorized',
  ]),
  message: z.string(),
  retryAfterSeconds: z.number().int().positive().optional(),
});

export type SetupRequest = z.infer<typeof setupRequestSchema>;
export type UnlockRequest = z.infer<typeof unlockRequestSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type SessionInfo = z.infer<typeof sessionInfoSchema>;
export type AuthErrorBody = z.infer<typeof authErrorSchema>;
