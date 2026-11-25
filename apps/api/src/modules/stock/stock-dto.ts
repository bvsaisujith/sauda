import type { StockMovementDto } from '@sauda/shared';
import type { StockMovementRecord } from './types.js';

export function toMovementDto(record: StockMovementRecord): StockMovementDto {
  return {
    id: record.id,
    itemId: record.itemId,
    type: record.type,
    quantity: record.quantity,
    unitCostPaise: record.unitCostPaise,
    note: record.note,
    createdAt: record.createdAt.toISOString(),
  };
}
