import type { StockMovementType } from '@sauda/shared';

export type StockSource = 'TOUCH' | 'VOICE' | 'SYSTEM';

export interface StockActor {
  shopId: string;
  ownerId: string;
  source: StockSource;
}

/**
 * A quantity is signed: receipts and upward adjustments are positive, every
 * reduction is negative. History is append-only, so a correction is a new row.
 */
export interface StockMovementRecord {
  id: string;
  itemId: string;
  type: StockMovementType;
  quantity: number;
  unitCostPaise: number | null;
  note: string | null;
  createdAt: Date;
}

export interface ReceiveInput {
  shopId: string;
  itemId: string;
  quantity: number;
  unitCostPaise: number;
  expiryDate: Date | null;
  note: string | null;
}

export interface AdjustInput {
  shopId: string;
  itemId: string;
  delta: number;
  reason: string;
  fallbackUnitCostPaise: number;
  /** Links the movement to the order or other record that caused it. */
  referenceType?: string;
  referenceId?: string;
}

export interface StockAuditWrite {
  shopId: string;
  ownerId: string;
  source: StockSource;
  operation: string;
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface StockStore {
  receive(input: ReceiveInput): Promise<StockMovementRecord>;
  adjust(input: AdjustInput): Promise<StockMovementRecord>;
  onHand(shopId: string, itemId: string): Promise<number>;
  onHandByShop(shopId: string): Promise<Map<string, number>>;
  listMovements(shopId: string, itemId: string, limit: number): Promise<StockMovementRecord[]>;
  recordAudit(entry: StockAuditWrite): Promise<void>;
}
