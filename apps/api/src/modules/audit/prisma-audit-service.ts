import { createAuditService } from './audit-service.js';
import { createPrismaAuditStore } from './prisma-audit-store.js';

export const auditService = createAuditService(createPrismaAuditStore());
