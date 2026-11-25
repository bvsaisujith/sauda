import type { StockAdjustRequest, StockMovementDto, StockReceiveRequest, StockWriteResult } from '@sauda/shared';
import type { ItemsService } from '../items/public.js';
import { InsufficientStockError, StockError } from './stock-errors.js';
import { toMovementDto } from './stock-dto.js';
import type { StockActor, StockStore } from './types.js';

export interface StockService {
  onHand(shopId: string, itemId: string): Promise<number>;
  onHandByShop(shopId: string): Promise<Map<string, number>>;
  receive(actor: StockActor, input: StockReceiveRequest): Promise<StockWriteResult>;
  adjust(actor: StockActor, input: StockAdjustRequest): Promise<StockWriteResult>;
  listMovements(shopId: string, itemId: string, limit?: number): Promise<StockMovementDto[]>;
}

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

const DEFAULT_MOVEMENT_LIMIT = 25;

export function createStockService(store: StockStore, items: ItemsService): StockService {
  async function requireItem(shopId: string, itemId: string) {
    const item = await items.get(shopId, itemId);

    if (item.archivedAt !== null) {
      throw new StockError('item-archived', 'That item is archived, so its stock cannot change');
    }

    return item;
  }

  return {
    async onHand(shopId, itemId) {
      return store.onHand(shopId, itemId);
    },

    async onHandByShop(shopId) {
      return store.onHandByShop(shopId);
    },

    async receive(actor, input) {
      const item = await requireItem(actor.shopId, input.itemId);
      const quantity = roundQuantity(input.quantity);

      const movement = await store.receive({
        shopId: actor.shopId,
        itemId: item.id,
        quantity,
        unitCostPaise: input.unitCostPaise ?? item.buyPricePaise,
        expiryDate: input.expiryDate === undefined ? null : new Date(`${input.expiryDate}T00:00:00.000Z`),
        note: input.note ?? null,
      });

      const onHand = await store.onHand(actor.shopId, item.id);

      await store.recordAudit({
        shopId: actor.shopId,
        ownerId: actor.ownerId,
        source: actor.source,
        operation: 'stock.receive',
        entityId: movement.id,
        after: { itemId: item.id, quantity, onHand },
      });

      return { movement: toMovementDto(movement), onHand };
    },

    async adjust(actor, input) {
      const item = await requireItem(actor.shopId, input.itemId);
      const delta = roundQuantity(input.delta);
      const before = await store.onHand(actor.shopId, item.id);

      let movement;

      try {
        movement = await store.adjust({
          shopId: actor.shopId,
          itemId: item.id,
          delta,
          reason: input.reason,
          fallbackUnitCostPaise: item.buyPricePaise,
        });
      } catch (error) {
        if (error instanceof InsufficientStockError) {
          throw new StockError(
            'insufficient-stock',
            `Only ${error.available} ${item.baseUnit} of ${item.name} on hand`,
          );
        }
        throw error;
      }

      const onHand = await store.onHand(actor.shopId, item.id);

      await store.recordAudit({
        shopId: actor.shopId,
        ownerId: actor.ownerId,
        source: actor.source,
        operation: 'stock.adjust',
        entityId: movement.id,
        before: { itemId: item.id, onHand: before },
        after: { itemId: item.id, delta, onHand, reason: input.reason },
      });

      return { movement: toMovementDto(movement), onHand };
    },

    async listMovements(shopId, itemId, limit = DEFAULT_MOVEMENT_LIMIT) {
      const records = await store.listMovements(shopId, itemId, limit);
      return records.map(toMovementDto);
    },
  };
}
