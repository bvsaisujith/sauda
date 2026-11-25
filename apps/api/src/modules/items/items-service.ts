import type { ItemDto, ItemInput, ItemUpdate } from '@sauda/shared';
import { ItemError } from './item-errors.js';
import { toItemDto } from './item-dto.js';
import type { ItemActor, ItemRecord, ItemStore } from './types.js';

export interface ItemsService {
  list(shopId: string, options?: { includeArchived?: boolean }): Promise<ItemDto[]>;
  get(shopId: string, itemId: string): Promise<ItemDto>;
  create(actor: ItemActor, input: ItemInput): Promise<ItemDto>;
  update(actor: ItemActor, itemId: string, patch: ItemUpdate): Promise<ItemDto>;
  archive(actor: ItemActor, itemId: string): Promise<void>;
}

/** Trimmed numbers round to the three decimals a quantity column stores. */
function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function snapshot(record: ItemRecord): Record<string, unknown> {
  return {
    name: record.name,
    baseUnit: record.baseUnit,
    sellPricePaise: record.sellPricePaise,
    buyPricePaise: record.buyPricePaise,
    reorderLevel: record.reorderLevel,
    gstRate: record.gstRate,
    hsnCode: record.hsnCode,
  };
}

export function createItemsService(store: ItemStore): ItemsService {
  async function requireItem(shopId: string, itemId: string): Promise<ItemRecord> {
    const record = await store.find(shopId, itemId);

    if (!record) {
      throw new ItemError('item-not-found', 'That item is not in this shop');
    }

    return record;
  }

  return {
    async list(shopId, options) {
      const records = await store.list(shopId, {
        includeArchived: options?.includeArchived ?? false,
      });

      return records.map(toItemDto);
    },

    async get(shopId, itemId) {
      return toItemDto(await requireItem(shopId, itemId));
    },

    async create(actor, input) {
      const record = await store.create(actor.shopId, {
        ...input,
        name: input.name.trim(),
        hsnCode: input.hsnCode === null ? null : (input.hsnCode.trim() || null),
        reorderLevel: roundQuantity(input.reorderLevel),
      });

      await store.recordAudit({
        shopId: actor.shopId,
        ownerId: actor.ownerId,
        source: actor.source,
        operation: 'items.create',
        entityType: 'Item',
        entityId: record.id,
        after: snapshot(record),
      });

      return toItemDto(record);
    },

    async update(actor, itemId, patch) {
      const before = await requireItem(actor.shopId, itemId);
      // Snapshot before the write so a store that mutates in place cannot make
      // the "before" and "after" halves of the audit entry look identical.
      const beforeState = snapshot(before);

      const normalised: ItemUpdate = {
        ...patch,
        ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
        ...(patch.hsnCode === undefined
          ? {}
          : { hsnCode: patch.hsnCode === null ? null : (patch.hsnCode.trim() || null) }),
        ...(patch.reorderLevel === undefined
          ? {}
          : { reorderLevel: roundQuantity(patch.reorderLevel) }),
      };

      const record = await store.update(actor.shopId, itemId, normalised);

      await store.recordAudit({
        shopId: actor.shopId,
        ownerId: actor.ownerId,
        source: actor.source,
        operation: 'items.update',
        entityType: 'Item',
        entityId: record.id,
        before: beforeState,
        after: snapshot(record),
      });

      return toItemDto(record);
    },

    async archive(actor, itemId) {
      const before = await requireItem(actor.shopId, itemId);

      if (before.archivedAt !== null) {
        return;
      }

      await store.archive(actor.shopId, itemId, new Date());

      await store.recordAudit({
        shopId: actor.shopId,
        ownerId: actor.ownerId,
        source: actor.source,
        operation: 'items.archive',
        entityType: 'Item',
        entityId: itemId,
        before: snapshot(before),
      });
    },
  };
}
