import type { OrderStatus, PartyType } from '@sauda/shared';
import { db } from '../../db.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { OrderError } from './order-errors.js';
import type {
  NormalisedLine,
  OrderAuditWrite,
  OrderListFilters,
  OrderLineRecord,
  OrderRecord,
  OrderStore,
  OrderWithLines,
} from './types.js';

interface OrderRow {
  id: string;
  type: string;
  partyId: string;
  orderDate: Date;
  status: string;
  totalPaise: { toString(): string };
  notes: string | null;
  version: number;
  createdAt: Date;
  bill: { id: string } | null;
  lines: {
    id: string;
    itemId: string;
    quantity: { toString(): string };
    ratePaise: { toString(): string };
    lineTotalPaise: { toString(): string };
  }[];
}

const ORDER_SELECT = {
  id: true,
  type: true,
  partyId: true,
  orderDate: true,
  status: true,
  totalPaise: true,
  notes: true,
  version: true,
  createdAt: true,
  bill: { select: { id: true } },
  lines: {
    select: {
      id: true,
      itemId: true,
      quantity: true,
      ratePaise: true,
      lineTotalPaise: true,
    },
    orderBy: { id: 'asc' },
  },
} as const;

const STATUS_TO_DB: Record<OrderStatus, 'PENDING' | 'FULFILLED' | 'CANCELLED'> = {
  pending: 'PENDING',
  fulfilled: 'FULFILLED',
  cancelled: 'CANCELLED',
};

const DB_TO_STATUS: Record<string, OrderStatus> = {
  PENDING: 'pending',
  FULFILLED: 'fulfilled',
  CANCELLED: 'cancelled',
};

function toRecord(row: OrderRow): OrderWithLines {
  const order: OrderRecord = {
    id: row.id,
    type: row.type === 'SUPPLIER' ? 'supplier' : 'customer',
    partyId: row.partyId,
    orderDate: row.orderDate,
    status: DB_TO_STATUS[row.status] ?? 'pending',
    totalPaise: Number(row.totalPaise),
    notes: row.notes,
    version: row.version,
    createdAt: row.createdAt,
    billId: row.bill?.id ?? null,
  };

  const lines: OrderLineRecord[] = row.lines.map((line) => ({
    id: line.id,
    itemId: line.itemId,
    quantity: Number(line.quantity),
    ratePaise: Number(line.ratePaise),
    lineTotalPaise: Number(line.lineTotalPaise),
  }));

  return { order, lines };
}

function lineCreateData(line: NormalisedLine): Prisma.OrderLineCreateWithoutOrderInput {
  return {
    item: { connect: { id: line.itemId } },
    quantity: line.quantity,
    ratePaise: line.ratePaise,
    lineTotalPaise: line.lineTotalPaise,
  };
}

function typeFilter(type: PartyType): Prisma.OrderWhereInput {
  return { type: type === 'customer' ? 'CUSTOMER' : 'SUPPLIER' };
}

export function createPrismaOrderStore(): OrderStore {
  return {
    async list(shopId, filters: OrderListFilters) {
      const rows = await db().order.findMany({
        where: {
          shopId,
          deletedAt: null,
          ...(filters.type === undefined ? {} : typeFilter(filters.type)),
          ...(filters.status === undefined ? {} : { status: STATUS_TO_DB[filters.status] }),
          ...(filters.partyId === undefined ? {} : { partyId: filters.partyId }),
        },
        select: ORDER_SELECT,
        orderBy: [{ createdAt: 'desc' }],
      });

      return rows.map(toRecord);
    },

    async find(shopId, orderId) {
      const row = await db().order.findFirst({
        where: { id: orderId, shopId, deletedAt: null },
        select: ORDER_SELECT,
      });

      return row ? toRecord(row) : null;
    },

    async create(shopId, input) {
      const row = await db().order.create({
        data: {
          shopId,
          type: input.type === 'customer' ? 'CUSTOMER' : 'SUPPLIER',
          partyId: input.partyId,
          orderDate: input.orderDate,
          notes: input.notes,
          totalPaise: input.totalPaise,
          lines: { create: input.lines.map(lineCreateData) },
        },
        select: ORDER_SELECT,
      });

      return toRecord(row);
    },

    async update(shopId, orderId, values) {
      return db().$transaction(async (tx) => {
        const current = await tx.order.findFirst({
          where: { id: orderId, shopId, deletedAt: null },
          select: { version: true },
        });

        if (!current) {
          throw new OrderError('order-not-found', 'That order is not in this shop');
        }

        if (current.version !== values.version) {
          throw new OrderError('order-stale', 'This order changed. Refresh to see the latest.');
        }

        await tx.orderLine.deleteMany({ where: { orderId } });

        const row = await tx.order.update({
          where: { id: orderId },
          data: {
            ...(values.partyId === undefined ? {} : { partyId: values.partyId }),
            ...(values.orderDate === undefined ? {} : { orderDate: values.orderDate }),
            ...(values.notes === undefined ? {} : { notes: values.notes }),
            totalPaise: values.totalPaise,
            version: { increment: 1 },
            lines: { create: values.lines.map(lineCreateData) },
          },
          select: ORDER_SELECT,
        });

        return toRecord(row);
      });
    },

    async setStatus(shopId, orderId, status) {
      await db().order.updateMany({
        where: { id: orderId, shopId },
        data: { status: STATUS_TO_DB[status], version: { increment: 1 } },
      });
    },

    async archive(shopId, orderId, at) {
      await db().order.updateMany({
        where: { id: orderId, shopId, deletedAt: null },
        data: { deletedAt: at },
      });
    },

    async recordAudit(entry: OrderAuditWrite) {
      await db().auditEntry.create({
        data: {
          shopId: entry.shopId,
          ownerId: entry.ownerId,
          source: entry.source,
          operation: entry.operation,
          entityType: 'Order',
          entityId: entry.entityId,
          ...(entry.before === undefined ? {} : { before: entry.before as Prisma.InputJsonValue }),
          ...(entry.after === undefined ? {} : { after: entry.after as Prisma.InputJsonValue }),
        },
      });
    },
  };
}
