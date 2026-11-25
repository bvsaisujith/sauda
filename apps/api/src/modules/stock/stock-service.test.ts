import { describe, expect, it } from 'vitest';
import type { ItemDto } from '@sauda/shared';
import type { ItemsService } from '../items/public.js';
import { createStockService } from './stock-service.js';
import { InsufficientStockError } from './stock-errors.js';
import type {
  AdjustInput,
  ReceiveInput,
  StockActor,
  StockAuditWrite,
  StockMovementRecord,
  StockStore,
} from './types.js';

const actor: StockActor = { shopId: 'shop_1', ownerId: 'owner_1', source: 'TOUCH' };

const salt: ItemDto = {
  id: 'item_1',
  name: 'Tata Salt',
  baseUnit: 'packet',
  sellPricePaise: 2800,
  buyPricePaise: 2500,
  reorderLevel: 10,
  gstRate: 5,
  hsnCode: null,
  archivedAt: null,
};

function fakeItems(items: ItemDto[]): ItemsService {
  return {
    async list() {
      return items;
    },
    async get(_shopId, itemId) {
      const item = items.find((candidate) => candidate.id === itemId);
      if (!item) {
        throw new Error('missing item');
      }
      return item;
    },
    async create() {
      throw new Error('not used');
    },
    async update() {
      throw new Error('not used');
    },
    async archive() {
      throw new Error('not used');
    },
  };
}

function createMemoryStore(): {
  store: StockStore;
  movements: StockMovementRecord[];
  audits: StockAuditWrite[];
  setOnHand: (value: number) => void;
} {
  const movements: StockMovementRecord[] = [];
  const audits: StockAuditWrite[] = [];
  let onHand = 0;
  let sequence = 0;

  const record = (
    itemId: string,
    type: StockMovementRecord['type'],
    quantity: number,
    unitCostPaise: number | null,
    note: string | null,
  ): StockMovementRecord => {
    sequence += 1;
    const movement: StockMovementRecord = {
      id: `movement_${sequence}`,
      itemId,
      type,
      quantity,
      unitCostPaise,
      note,
      createdAt: new Date('2026-11-24T10:00:00.000Z'),
    };
    movements.push(movement);
    return movement;
  };

  const store: StockStore = {
    async receive(input: ReceiveInput) {
      onHand += input.quantity;
      return record(input.itemId, 'RECEIPT', input.quantity, input.unitCostPaise, input.note);
    },
    async adjust(input: AdjustInput) {
      if (input.delta < 0 && onHand + input.delta < 0) {
        throw new InsufficientStockError(onHand);
      }
      onHand += input.delta;
      return record(
        input.itemId,
        'ADJUSTMENT',
        input.delta,
        input.delta > 0 ? input.fallbackUnitCostPaise : null,
        input.reason,
      );
    },
    async onHand() {
      return onHand;
    },
    async onHandByShop() {
      return new Map([['item_1', onHand]]);
    },
    async listMovements() {
      return movements;
    },
    async recordAudit(entry) {
      audits.push(entry);
    },
  };

  return {
    store,
    movements,
    audits,
    setOnHand: (value) => {
      onHand = value;
    },
  };
}

describe('stock service', () => {
  it('receives stock at the item buy price by default', async () => {
    const { store, audits } = createMemoryStore();
    const service = createStockService(store, fakeItems([salt]));

    const result = await service.receive(actor, { itemId: 'item_1', quantity: 12 });

    expect(result.movement.type).toBe('RECEIPT');
    expect(result.movement.unitCostPaise).toBe(2500);
    expect(result.onHand).toBe(12);
    expect(audits[0]?.operation).toBe('stock.receive');
  });

  it('honours an explicit cost and expiry date', async () => {
    const { store } = createMemoryStore();
    const service = createStockService(store, fakeItems([salt]));

    const result = await service.receive(actor, {
      itemId: 'item_1',
      quantity: 4,
      unitCostPaise: 2300,
      expiryDate: '2027-03-31',
      note: 'new lot',
    });

    expect(result.movement.unitCostPaise).toBe(2300);
    expect(result.movement.note).toBe('new lot');
  });

  it('reports how much is on hand when an adjustment goes too far', async () => {
    const { store, setOnHand, movements } = createMemoryStore();
    setOnHand(3);
    const service = createStockService(store, fakeItems([salt]));

    await expect(
      service.adjust(actor, { itemId: 'item_1', delta: -5, reason: 'damaged' }),
    ).rejects.toMatchObject({ code: 'insufficient-stock', status: 409 });

    expect(movements).toHaveLength(0);
  });

  it('adds an upward adjustment at the buy price and audits it', async () => {
    const { store, audits } = createMemoryStore();
    const service = createStockService(store, fakeItems([salt]));

    const result = await service.adjust(actor, { itemId: 'item_1', delta: 2.5, reason: 'found' });

    expect(result.movement.quantity).toBe(2.5);
    expect(result.movement.unitCostPaise).toBe(2500);
    expect(audits.at(-1)?.operation).toBe('stock.adjust');
  });

  it('refuses to change stock of an archived item', async () => {
    const { store } = createMemoryStore();
    const service = createStockService(
      store,
      fakeItems([{ ...salt, archivedAt: '2026-11-01T00:00:00.000Z' }]),
    );

    await expect(service.receive(actor, { itemId: 'item_1', quantity: 1 })).rejects.toMatchObject({
      code: 'item-archived',
    });
  });

  it('rounds quantities to three decimals', async () => {
    const { store } = createMemoryStore();
    const service = createStockService(store, fakeItems([salt]));

    const result = await service.receive(actor, { itemId: 'item_1', quantity: 1.23456 });

    expect(result.movement.quantity).toBe(1.235);
  });
});
