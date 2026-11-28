import type { AuditEntryDto } from '@sauda/shared';
import type { AuditEntryRecord, AuditListFilters, AuditStore } from './types.js';

export interface AuditService {
  list(shopId: string, filters?: AuditListFilters): Promise<AuditEntryDto[]>;
}

function toDto(record: AuditEntryRecord): AuditEntryDto {
  return {
    id: record.id,
    ownerId: record.ownerId,
    source: record.source,
    operation: record.operation,
    entityType: record.entityType,
    entityId: record.entityId,
    before: record.before ?? null,
    after: record.after ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

export function createAuditService(store: AuditStore): AuditService {
  return {
    async list(shopId, filters) {
      const records = await store.list(shopId, filters ?? {});
      return records.map(toDto);
    },
  };
}
