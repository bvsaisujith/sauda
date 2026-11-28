import type {
  BillDto,
  OrderDto,
  OrderInput,
  OrderLineInput,
  OrderUpdate,
  PartyType,
} from '@sauda/shared';
import { billsService, type BillsService } from '../bills/public.js';
import { stockService, type StockService } from '../stock/public.js';
import { OrderError } from './order-errors.js';
import { toOrderDto } from './order-dto.js';
import type {
  NormalisedLine,
  OrderActor,
  OrderListFilters,
  OrderStore,
  OrderWithLines,
} from './types.js';

export interface OrderWriteResult {
  order: OrderDto;
  bill: BillDto | null;
}

export interface OrdersService {
  list(shopId: string, filters?: OrderListFilters): Promise<OrderDto[]>;
  get(shopId: string, orderId: string): Promise<OrderDto>;
  create(actor: OrderActor, input: OrderInput): Promise<OrderWriteResult>;
  update(actor: OrderActor, orderId: string, patch: OrderUpdate): Promise<OrderDto>;
  fulfil(actor: OrderActor, orderId: string): Promise<BillDto>;
  remove(actor: OrderActor, orderId: string): Promise<void>;
}

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function optional(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function normaliseLines(lines: OrderLineInput[]): NormalisedLine[] {
  return lines.map((line) => {
    const quantity = roundQuantity(line.quantity);

    return {
      itemId: line.itemId,
      quantity,
      ratePaise: line.ratePaise,
      lineTotalPaise: Math.round(quantity * line.ratePaise),
    };
  });
}

export function totalOf(lines: NormalisedLine[]): number {
  return lines.reduce((total, line) => total + line.lineTotalPaise, 0);
}

function snapshot(record: OrderWithLines): Record<string, unknown> {
  return {
    type: record.order.type,
    partyId: record.order.partyId,
    orderDate: record.order.orderDate.toISOString().slice(0, 10),
    status: record.order.status,
    totalPaise: record.order.totalPaise,
    notes: record.order.notes,
    lines: record.lines.map((line) => ({
      itemId: line.itemId,
      quantity: line.quantity,
      ratePaise: line.ratePaise,
    })),
  };
}

/** Quantity totals per item, so an edit can be applied as a difference. */
function quantityByItem(lines: { itemId: string; quantity: number }[]): Map<string, number> {
  const totals = new Map<string, number>();

  for (const line of lines) {
    totals.set(line.itemId, roundQuantity((totals.get(line.itemId) ?? 0) + line.quantity));
  }

  return totals;
}

function stockSign(type: PartyType): number {
  // A customer order sends stock out; a supplier order brings it in.
  return type === 'customer' ? -1 : 1;
}

export function createOrdersService(
  store: OrderStore,
  stock: StockService = stockService,
  bills: BillsService = billsService,
): OrdersService {
  async function requireOrder(shopId: string, orderId: string): Promise<OrderWithLines> {
    const record = await store.find(shopId, orderId);

    if (!record) {
      throw new OrderError('order-not-found', 'That order is not in this shop');
    }

    return record;
  }

  async function applyStock(
    actor: OrderActor,
    orderId: string,
    itemId: string,
    delta: number,
    reason: string,
  ): Promise<void> {
    if (delta === 0) {
      return;
    }

    await stock.adjust(
      actor,
      { itemId, delta, reason },
      { type: 'order', id: orderId },
    );
  }

  async function reverseApplied(
    actor: OrderActor,
    orderId: string,
    applied: { itemId: string; delta: number }[],
  ): Promise<void> {
    for (const entry of [...applied].reverse()) {
      await applyStock(
        actor,
        orderId,
        entry.itemId,
        -entry.delta,
        'Reversal after a failed order change',
      ).catch(() => undefined);
    }
  }

  async function fulfilOrder(actor: OrderActor, orderId: string): Promise<BillDto> {
    const current = await requireOrder(actor.shopId, orderId);

    // Fulfilling twice is a no-op: the bill already exists and stock already moved.
    if (current.order.status === 'fulfilled') {
      const existing = await bills.findByOrder(actor.shopId, orderId);

      if (existing) {
        return existing;
      }

      throw new OrderError('order-not-pending', 'This order is already fulfilled');
    }

    if (current.order.status !== 'pending') {
      throw new OrderError('order-not-pending', 'Only a pending order can be fulfilled');
    }

    const sign = stockSign(current.order.type);
    const applied: { itemId: string; delta: number }[] = [];

    try {
      for (const line of current.lines) {
        const delta = roundQuantity(sign * line.quantity);
        await applyStock(
          actor,
          current.order.id,
          line.itemId,
          delta,
          `${current.order.type === 'customer' ? 'Sold on' : 'Received on'} order ${current.order.id}`,
        );
        applied.push({ itemId: line.itemId, delta });
      }

      const bill = await bills.createForOrder(actor, {
        shopId: actor.shopId,
        orderId: current.order.id,
        partyId: current.order.partyId,
        orderType: current.order.type,
        totalPaise: current.order.totalPaise,
      });

      await store.setStatus(actor.shopId, current.order.id, 'fulfilled');

      await store.recordAudit({
        shopId: actor.shopId,
        ownerId: actor.ownerId,
        source: actor.source,
        operation: 'orders.fulfil',
        entityId: current.order.id,
        before: snapshot(current),
        after: { status: 'fulfilled', billId: bill.id, billNumber: bill.billNumber },
      });

      return bill;
    } catch (error) {
      await reverseApplied(actor, current.order.id, applied);
      throw error;
    }
  }

  return {
    async list(shopId, filters) {
      const records = await store.list(shopId, filters ?? {});
      return records.map(toOrderDto);
    },

    async get(shopId, orderId) {
      return toOrderDto(await requireOrder(shopId, orderId));
    },

    async create(actor, input) {
      const lines = normaliseLines(input.lines);

      const record = await store.create(actor.shopId, {
        type: input.type,
        partyId: input.partyId,
        orderDate: new Date(`${input.orderDate}T00:00:00.000Z`),
        notes: optional(input.notes),
        lines,
        totalPaise: totalOf(lines),
      });

      await store.recordAudit({
        shopId: actor.shopId,
        ownerId: actor.ownerId,
        source: actor.source,
        operation: 'orders.create',
        entityId: record.order.id,
        after: snapshot(record),
      });

      if (!input.fulfil) {
        return { order: toOrderDto(record), bill: null };
      }

      const bill = await fulfilOrder(actor, record.order.id);
      const refreshed = await requireOrder(actor.shopId, record.order.id);
      return { order: toOrderDto(refreshed), bill };
    },

    async update(actor, orderId, patch) {
      const current = await requireOrder(actor.shopId, orderId);

      if (patch.version !== current.order.version) {
        throw new OrderError('order-stale', 'This order changed. Refresh to see the latest.');
      }

      const lines =
        patch.lines === undefined
          ? current.lines.map((line) => ({
              itemId: line.itemId,
              quantity: line.quantity,
              ratePaise: line.ratePaise,
              lineTotalPaise: line.lineTotalPaise,
            }))
          : normaliseLines(patch.lines);

      const totalPaise = totalOf(lines);
      const fulfilled = current.order.status === 'fulfilled';
      const sign = stockSign(current.order.type);
      const applied: { itemId: string; delta: number }[] = [];

      try {
        if (fulfilled) {
          const before = quantityByItem(current.lines);
          const after = quantityByItem(lines);
          const itemIds = new Set([...before.keys(), ...after.keys()]);

          for (const itemId of itemIds) {
            const delta = roundQuantity(
              sign * (after.get(itemId) ?? 0) - sign * (before.get(itemId) ?? 0),
            );

            if (delta === 0) {
              continue;
            }

            await applyStock(
              actor,
              orderId,
              itemId,
              delta,
              `Order ${orderId} edited`,
            );
            applied.push({ itemId, delta });
          }
        }

        const record = await store.update(actor.shopId, orderId, {
          ...(patch.partyId === undefined ? {} : { partyId: patch.partyId }),
          ...(patch.orderDate === undefined
            ? {}
            : { orderDate: new Date(`${patch.orderDate}T00:00:00.000Z`) }),
          ...(patch.notes === undefined ? {} : { notes: optional(patch.notes) }),
          lines,
          totalPaise,
          version: patch.version,
        });

        if (fulfilled) {
          await bills.syncOrderTotal(actor, orderId, totalPaise);

          if (patch.partyId !== undefined && patch.partyId !== current.order.partyId) {
            await bills.syncOrderParty(actor, orderId, patch.partyId);
          }
        }

        await store.recordAudit({
          shopId: actor.shopId,
          ownerId: actor.ownerId,
          source: actor.source,
          operation: 'orders.update',
          entityId: orderId,
          before: snapshot(current),
          after: snapshot(record),
        });

        return toOrderDto(record);
      } catch (error) {
        await reverseApplied(actor, orderId, applied);
        throw error;
      }
    },

    async fulfil(actor, orderId) {
      return fulfilOrder(actor, orderId);
    },

    async remove(actor, orderId) {
      const current = await requireOrder(actor.shopId, orderId);
      const fulfilled = current.order.status === 'fulfilled';
      const sign = stockSign(current.order.type);
      const applied: { itemId: string; delta: number }[] = [];

      try {
        if (fulfilled) {
          for (const line of current.lines) {
            const delta = roundQuantity(-sign * line.quantity);
            await applyStock(
              actor,
              orderId,
              line.itemId,
              delta,
              `Order ${orderId} deleted`,
            );
            applied.push({ itemId: line.itemId, delta });
          }
        }

        await bills.removeForOrder(actor, orderId);
        await store.archive(actor.shopId, orderId, new Date());

        await store.recordAudit({
          shopId: actor.shopId,
          ownerId: actor.ownerId,
          source: actor.source,
          operation: 'orders.delete',
          entityId: orderId,
          before: snapshot(current),
        });
      } catch (error) {
        await reverseApplied(actor, orderId, applied);
        throw error;
      }
    },
  };
}
