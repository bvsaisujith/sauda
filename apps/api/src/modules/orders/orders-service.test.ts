import { describe, expect, it } from 'vitest';
import type { BillDto } from '@sauda/shared';
import { createOrdersService, normaliseLines, totalOf } from './orders-service.js';
import type { OrderActor, OrderRecord, OrderStore, OrderWithLines } from './types.js';
import { InsufficientStockError } from '../stock/stock-errors.js';
import type { StockStore } from '../stock/types.js';
import { createStockService } from '../stock/stock-service.js';
import type { BillsService } from '../bills/public.js';

const actor: OrderActor = { shopId: 'shop_1', ownerId: 'owner_1', source: 'TOUCH' };

function orderRecord(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: 'order_1',
    type: 'customer',
    partyId: 'party_1',
    orderDate: new Date('2026-11-20T00:00:00.000Z'),
    status: 'pending',
    totalPaise: 50_000,
    notes: null,
    version: 1,
    createdAt: new Date('2026-11-20T10:00:00.000Z'),
    billId: null,
    ...overrides,
  };
}

function line(id: string, itemId: string, quantity: number, ratePaise: number) {
  return { id, itemId, quantity, ratePaise, lineTotalPaise: Math.round(quantity * ratePaise) };
}

function createOrderStore(initial: OrderWithLines) {
  let current = initial;
  const audits: { operation: string }[] = [];

  const store: OrderStore = {
    async list() {
      return [current];
    },
    async find() {
      return current;
    },
    async create(_shopId, input) {
      const order = orderRecord({
        id: 'order_1',
        type: input.type,
        partyId: input.partyId,
        orderDate: input.orderDate,
        notes: input.notes,
        totalPaise: input.totalPaise,
      });

      current = {
        order,
        lines: input.lines.map((entry, index) => ({
          id: `line_${index + 1}`,
          itemId: entry.itemId,
          quantity: entry.quantity,
          ratePaise: entry.ratePaise,
          lineTotalPaise: entry.lineTotalPaise,
        })),
      };

      return current;
    },
    async update(_shopId, orderId, values) {
      current = {
        order: {
          ...current.order,
          version: current.order.version + 1,
          totalPaise: values.totalPaise,
          ...(values.partyId === undefined ? {} : { partyId: values.partyId }),
        },
        lines: values.lines.map((entry, index) => ({
          id: `line_${index + 1}`,
          itemId: entry.itemId,
          quantity: entry.quantity,
          ratePaise: entry.ratePaise,
          lineTotalPaise: entry.lineTotalPaise,
        })),
      };

      void orderId;
      return current;
    },
    async setStatus(_shopId, _orderId, status) {
      current = { ...current, order: { ...current.order, status: status === 'fulfilled' ? 'fulfilled' : status, version: current.order.version + 1 } };
    },
    async archive() {
      // not used
    },
    async recordAudit(entry) {
      audits.push({ operation: entry.operation });
    },
  };

  return { store, audits, get: () => current };
}

function createStockMemory() {
  let onHand = 0;
  const movements: { itemId: string; delta: number; reason: string }[] = [];

  const store: StockStore = {
    async receive() {
      throw new Error('not used');
    },
    async adjust(input) {
      if (input.delta < 0 && onHand + input.delta < 0) {
        throw new InsufficientStockError(onHand);
      }
      onHand += input.delta;
      movements.push({ itemId: input.itemId, delta: input.delta, reason: input.reason });
      return {
        id: `movement_${movements.length}`,
        itemId: input.itemId,
        type: 'ADJUSTMENT',
        quantity: input.delta,
        unitCostPaise: null,
        note: input.reason,
        createdAt: new Date('2026-11-21T10:00:00.000Z'),
      };
    },
    async onHand() {
      return onHand;
    },
    async onHandByShop() {
      return new Map([['item_1', onHand]]);
    },
    async listMovements() {
      return [];
    },
    async recordAudit() {
      // not used
    },
  };

  const stock = createStockService(store, {
    async list() {
      return [];
    },
    async get(_shopId, itemId) {
      return {
        id: itemId,
        name: 'Rice',
        baseUnit: 'kg',
        sellPricePaise: 5000,
        buyPricePaise: 4000,
        reorderLevel: 0,
        gstRate: 0,
        hsnCode: null,
        archivedAt: null,
      };
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
  });

  return { stock, movements, getOnHand: () => onHand, setOnHand: (value: number) => { onHand = value; } };
}

function createBillsMemory() {
  const created: { orderId: string; totalPaise: number }[] = [];
  const removed: string[] = [];
  const totals: { orderId: string; totalPaise: number }[] = [];

  const bills: BillsService = {
    async list() {
      return [];
    },
    async get() {
      throw new Error('not used');
    },
    async findByOrder() {
      return null;
    },
    async createForOrder(_billActor, input) {
      created.push({ orderId: input.orderId, totalPaise: input.totalPaise });
      return {
        id: 'bill_1',
        orderId: input.orderId,
        billNumber: 'B-000001',
        partyId: input.partyId,
        orderType: input.orderType,
        totalPaise: input.totalPaise,
        paidPaise: 0,
        balancePaise: input.totalPaise,
        status: 'unpaid',
        closed: false,
        version: 1,
        createdAt: new Date('2026-11-21T10:00:00.000Z'),
      } satisfies BillDto;
    },
    async addPayment() {
      throw new Error('not used');
    },
    async updatePayment() {
      throw new Error('not used');
    },
    async deletePayment() {
      throw new Error('not used');
    },
    async reopen() {
      throw new Error('not used');
    },
    async syncOrderTotal(_billActor, orderId, totalPaise) {
      totals.push({ orderId, totalPaise });
    },
    async syncOrderParty() {
      // not used
    },
    async removeForOrder(_billActor, orderId) {
      removed.push(orderId);
    },
    async outstandingByParty() {
      return new Map();
    },
    async summary() {
      throw new Error('not used');
    },
  };

  return { bills, created, removed, totals };
}

describe('order helpers', () => {
  it('rounds quantities to three decimals and multiplies the rate', () => {
    const lines: NormalisedLine[] = normaliseLines([
      { itemId: 'item_1', quantity: 1.23456, ratePaise: 5000 },
    ]);

    expect(lines[0]?.quantity).toBe(1.235);
    expect(lines[0]?.lineTotalPaise).toBe(6175);
    expect(totalOf(lines)).toBe(6175);
  });
});

describe('orders service', () => {
  it('fulfilling a customer order reduces stock and creates one bill', async () => {
    const { store, audits } = createOrderStore({
      order: orderRecord(),
      lines: [line('line_1', 'item_1', 5, 10_000)],
    });
    const stock = createStockMemory();
    stock.setOnHand(50);
    const { bills, created } = createBillsMemory();
    const service = createOrdersService(store, stock.stock, bills);

    const bill = await service.fulfil(actor, 'order_1');

    expect(stock.getOnHand()).toBe(45);
    expect(created).toEqual([{ orderId: 'order_1', totalPaise: 50_000 }]);
    expect(bill.id).toBe('bill_1');
    expect(audits.at(-1)?.operation).toBe('orders.fulfil');
  });

  it('fulfilling a supplier order increases stock', async () => {
    const { store } = createOrderStore({
      order: orderRecord({ type: 'supplier' }),
      lines: [line('line_1', 'item_1', 10, 4000)],
    });
    const stock = createStockMemory();
    stock.setOnHand(5);
    const { bills } = createBillsMemory();
    const service = createOrdersService(store, stock.stock, bills);

    await service.fulfil(actor, 'order_1');

    expect(stock.getOnHand()).toBe(15);
  });

  it('fulfilling twice is a no-op that returns the same bill', async () => {
    const { store } = createOrderStore({
      order: orderRecord({ status: 'fulfilled', billId: 'bill_1' }),
      lines: [line('line_1', 'item_1', 5, 10_000)],
    });
    const stock = createStockMemory();
    stock.setOnHand(50);
    const { bills, created } = createBillsMemory();
    bills.findByOrder = async () => ({
      id: 'bill_1',
      orderId: 'order_1',
      billNumber: 'B-000001',
      partyId: 'party_1',
      orderType: 'customer',
      totalPaise: 50_000,
      paidPaise: 0,
      balancePaise: 50_000,
      status: 'unpaid',
      closed: false,
      version: 1,
      createdAt: new Date('2026-11-21T10:00:00.000Z'),
    });
    const service = createOrdersService(store, stock.stock, bills);

    const bill = await service.fulfil(actor, 'order_1');

    expect(bill.id).toBe('bill_1');
    expect(stock.getOnHand()).toBe(50);
    expect(created).toHaveLength(0);
  });

  it('applies only the difference to stock when a fulfilled order is edited', async () => {
    const { store } = createOrderStore({
      order: orderRecord({ status: 'fulfilled', billId: 'bill_1', totalPaise: 50_000 }),
      lines: [line('line_1', 'item_1', 5, 10_000)],
    });
    const stock = createStockMemory();
    stock.setOnHand(45);
    const { bills, totals } = createBillsMemory();
    const service = createOrdersService(store, stock.stock, bills);

    await service.update(actor, 'order_1', {
      version: 1,
      lines: [{ itemId: 'item_1', quantity: 8, ratePaise: 10_000 }],
    });

    expect(stock.getOnHand()).toBe(42);
    expect(totals).toEqual([{ orderId: 'order_1', totalPaise: 80_000 }]);
  });

  it('rejects a stale order edit', async () => {
    const { store } = createOrderStore({
      order: orderRecord(),
      lines: [line('line_1', 'item_1', 5, 10_000)],
    });
    const stock = createStockMemory();
    const { bills } = createBillsMemory();
    const service = createOrdersService(store, stock.stock, bills);

    await expect(
      service.update(actor, 'order_1', {
        version: 9,
        lines: [{ itemId: 'item_1', quantity: 6, ratePaise: 10_000 }],
      }),
    ).rejects.toMatchObject({ code: 'order-stale' });
  });

  it('deleting a fulfilled order reverses stock and removes the bill', async () => {
    const { store } = createOrderStore({
      order: orderRecord({ status: 'fulfilled', billId: 'bill_1', totalPaise: 50_000 }),
      lines: [line('line_1', 'item_1', 5, 10_000)],
    });
    const stock = createStockMemory();
    stock.setOnHand(45);
    const { bills, removed } = createBillsMemory();
    const service = createOrdersService(store, stock.stock, bills);

    await service.remove(actor, 'order_1');

    expect(stock.getOnHand()).toBe(50);
    expect(removed).toEqual(['order_1']);
  });

  it('rolls the stock effect back when fulfilling fails for lack of stock', async () => {
    const { store } = createOrderStore({
      order: orderRecord(),
      lines: [line('line_1', 'item_1', 5, 10_000)],
    });
    const stock = createStockMemory();
    stock.setOnHand(2);
    const { bills, created } = createBillsMemory();
    const service = createOrdersService(store, stock.stock, bills);

    await expect(service.fulfil(actor, 'order_1')).rejects.toMatchObject({
      code: 'insufficient-stock',
    });

    expect(stock.getOnHand()).toBe(2);
    expect(created).toHaveLength(0);
  });
});

export type { OrderDto, OrderListFilters, OrderActor, StockActor };