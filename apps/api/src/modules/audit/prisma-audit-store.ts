import { db } from '../../db.js';
import type { AuditEntryRecord, AuditListFilters, AuditStore } from './types.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function createPrismaAuditStore(): AuditStore {
  return {
    async list(shopId, filters: AuditListFilters) {
      const rows = await db().auditEntry.findMany({
        where: {
          shopId,
          ...(filters.entityType === undefined ? {} : { entityType: filters.entityType }),
          ...(filters.entityId === undefined ? {} : { entityId: filters.entityId }),
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(filters.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
      });

      return rows.map<AuditEntryRecord>((row) => ({
        id: row.id,
        ownerId: row.ownerId,
        source: row.source as AuditEntryRecord['source'],
        operation: row.operation,
        entityType: row.entityType,
        entityId: row.entityId,
        before: row.before,
        after: row.after,
        createdAt: row.createdAt,
      }));
    },
  };
}
