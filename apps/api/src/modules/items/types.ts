import type { ItemInput, ItemUpdate, Unit } from '@sauda/shared';

export type ItemSource = 'TOUCH' | 'VOICE' | 'SYSTEM';

export interface ItemActor {
  shopId: string;
  ownerId: string;
  source: ItemSource;
}

/**
 * The module's own shape for an item. Money is still paise, but dates stay
 * Date objects until the DTO boundary so callers never parse strings.
 */
export interface ItemRecord {
  id: string;
  name: string;
  baseUnit: Unit;
  sellPricePaise: number;
  buyPricePaise: number;
  reorderLevel: number;
  gstRate: number;
  hsnCode: string | null;
  archivedAt: Date | null;
}

export interface AuditWrite {
  shopId: string;
  ownerId: string;
  source: ItemSource;
  operation: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface ItemStore {
  list(shopId: string, options: { includeArchived: boolean }): Promise<ItemRecord[]>;
  find(shopId: string, itemId: string): Promise<ItemRecord | null>;
  create(shopId: string, input: ItemInput): Promise<ItemRecord>;
  update(shopId: string, itemId: string, patch: ItemUpdate): Promise<ItemRecord>;
  archive(shopId: string, itemId: string, at: Date): Promise<void>;
  recordAudit(entry: AuditWrite): Promise<void>;
}
