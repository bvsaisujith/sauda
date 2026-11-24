import { z } from 'zod';

/**
 * Shop owners type this on a phone, so the rule stays simple: 8 to 64
 * characters with at least one letter and one digit. That keeps out the
 * all-digit PINs and plain words that scrypt would otherwise be stretching.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(64, 'Password must be 64 characters or fewer')
  .regex(/[A-Za-z]/, 'Password must include at least one letter')
  .regex(/\d/, 'Password must include at least one digit');

export const shopNameSchema = z.string().trim().min(1, 'Enter your shop name').max(80);

export const signUpRequestSchema = z.object({
  shopName: shopNameSchema,
  password: passwordSchema,
});

export const signInRequestSchema = z.object({
  shopName: shopNameSchema,
  password: z.string().min(1, 'Enter your password').max(64),
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
    'shop-exists',
    'invalid-credentials',
    'locked',
    'unauthorized',
  ]),
  message: z.string(),
  retryAfterSeconds: z.number().int().positive().optional(),
});

export type SignUpRequest = z.infer<typeof signUpRequestSchema>;
export type SignInRequest = z.infer<typeof signInRequestSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type SessionInfo = z.infer<typeof sessionInfoSchema>;
export type AuthErrorBody = z.infer<typeof authErrorSchema>;