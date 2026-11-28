export interface AuditEntryRecord {
  id: string;
  ownerId: string | null;
  source: 'TOUCH' | 'VOICE' | 'SYSTEM';
  operation: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  createdAt: Date;
}

export interface AuditListFilters {
  entityType?: string;
  entityId?: string;
  limit?: number;
}

export interface AuditStore {
  list(shopId: string, filters: AuditListFilters): Promise<AuditEntryRecord[]>;
}
