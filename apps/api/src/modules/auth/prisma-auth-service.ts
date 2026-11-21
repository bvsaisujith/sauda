import { env } from '../../config.js';
import { createAuthService } from './auth-service.js';
import { createPrismaAuthStore } from './prisma-auth-store.js';

export const authService = createAuthService(createPrismaAuthStore(), {
  tokenTtlDays: env.DEVICE_TOKEN_DAYS,
});
