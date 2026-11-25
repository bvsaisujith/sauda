import { describe, expect, it } from 'vitest';
import type { ItemInput } from '@sauda/shared';
import { createItemsService } from './items-service.js';
import { ItemError } from './item-errors.js';
import type { AuditWrite, ItemActor, ItemRecord, ItemStore } from './types.js';

const actor: ItemActor = { shopId: 'shop_1', ownerId: 'owner_1', source: 'TOUCH' };

function input(overrides: Partial<ItemInput> = {}): ItemInput {
  return {
    name: 'Tata Salt',
    baseUnit: 'packet',
    sellPricePaise: 2800,
    buyPricePaise: 2500,
    reorderLevel: 10,
    gstRate: 5,
    hsnCode: null,
    ...overrides,
  };
}

function createMemoryStore(): { store: ItemStore; records: ItemRecord[]; audits: AuditWrite[] } {
  const records: ItemRecord[] = [];
  const audits: AuditWrite[] = [];
  const owners = new Map<string, string>();
  let sequence = 0;

  const findInShop = (shopId: string, itemId: string): ItemRecord | undefined =>
    owners.get(itemId) === shopId ? records.find((record) => record.id === itemId) : undefined;

  const store: ItemStore = {
    async list(shopId, { includeArchived }) {
      return records.filter(
        (record) => owners.get(record.id) === shopId && (includeArchived || record.archivedAt === null),
      );
    },
    async find(shopId, itemId) {
      return findInShop(shopId, itemId) ?? null;
    },
    async create(shopId, itemInput) {
      if (records.some((record) => record.name === itemInput.name)) {
        throw new ItemError('item-exists', 'An item with that name exists');
      }
      sequence += 1;
      const record: ItemRecord = {
        id: `item_${sequence}`,
        name: itemInput.name,
        baseUnit: itemInput.baseUnit,
        sellPricePaise: itemInput.sellPricePaise,
        buyPricePaise: itemInput.buyPricePaise,
        reorderLevel: itemInput.reorderLevel,
        gstRate: itemInput.gstRate,
        hsnCode: itemInput.hsnCode,
        archivedAt: null,
      };
      records.push(record);
      owners.set(record.id, shopId);
      return record;
    },
    async update(shopId, itemId, patch) {
      const record = findInShop(shopId, itemId);
      if (!record) {
        throw new ItemError('item-not-found', 'Missing');
      }
      Object.assign(record, patch);
      return record;
    },
    async archive(shopId, itemId, at) {
      const record = findInShop(shopId, itemId);
      if (record) {
        record.archivedAt = at;
      }
    },
    async recordAudit(entry) {
      audits.push(entry);
    },
  };

  return { store, records, audits };
}

describe('items service', () => {
  it('creates an item and records an audit entry', async () => {
    const { store, audits } = createMemoryStore();
    const service = createItemsService(store);

    const created = await service.create(actor, input());

    expect(created.name).toBe('Tata Salt');
    expect(created.sellPricePaise).toBe(2800);
    expect(audits).toHaveLength(1);
    expect(audits[0]?.operation).toBe('items.create');
    expect(audits[0]?.after).toMatchObject({ name: 'Tata Salt' });
  });

  it('turns a duplicate name into an item-exists error', async () => {
    const { store } = createMemoryStore();
    const service = createItemsService(store);
    await service.create(actor, input());

    await expect(service.create(actor, input())).rejects.toMatchObject({ code: 'item-exists' });
  });

  it('records the old and new price when a price changes', async () => {
    const { store, audits } = createMemoryStore();
    const service = createItemsService(store);
    const created = await service.create(actor, input());

    const updated = await service.update(actor, created.id, { sellPricePaise: 3000 });

    expect(updated.sellPricePaise).toBe(3000);
    expect(audits.at(-1)).toMatchObject({
      operation: 'items.update',
      before: { sellPricePaise: 2800 },
      after: { sellPricePaise: 3000 },
    });
  });

  it('hides archived items from the default list but keeps history', async () => {
    const { store } = createMemoryStore();
    const service = createItemsService(store);
    const created = await service.create(actor, input());

    await service.archive(actor, created.id);

    expect(await service.list(actor.shopId)).toHaveLength(0);
    expect(await service.list(actor.shopId, { includeArchived: true })).toHaveLength(1);
  });

  it('does not audit a second archive of the same item', async () => {
    const { store, audits } = createMemoryStore();
    const service = createItemsService(store);
    const created = await service.create(actor, input());

    await service.archive(actor, created.id);
    await service.archive(actor, created.id);

    expect(audits.filter((entry) => entry.operation === 'items.archive')).toHaveLength(1);
  });

  it('refuses an item that belongs to another shop', async () => {
    const { store } = createMemoryStore();
    const service = createItemsService(store);
    const created = await service.create(actor, input());

    await expect(
      service.update({ ...actor, shopId: 'shop_2' }, created.id, { sellPricePaise: 1 }),
    ).rejects.toMatchObject({ code: 'item-not-found' });
  });
});
