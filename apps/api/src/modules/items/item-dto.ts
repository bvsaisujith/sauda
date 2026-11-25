import type { ItemDto } from '@sauda/shared';
import type { ItemRecord } from './types.js';

export function toItemDto(record: ItemRecord): ItemDto {
  return {
    id: record.id,
    name: record.name,
    baseUnit: record.baseUnit,
    sellPricePaise: record.sellPricePaise,
    buyPricePaise: record.buyPricePaise,
    reorderLevel: record.reorderLevel,
    gstRate: record.gstRate,
    hsnCode: record.hsnCode,
    archivedAt: record.archivedAt === null ? null : record.archivedAt.toISOString(),
  };
}
