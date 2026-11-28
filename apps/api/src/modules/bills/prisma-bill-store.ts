import type { BillPaymentUpdate, BillStatus, PaymentMode } from '@sauda/shared';
import { db } from '../../db.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { BillError } from './bill-errors.js';
import type {
  BillAuditWrite,
  BillListFilters,
  BillPaymentRecord,
  BillRecord,
  BillStore,
  CreateBillInput,
  PartyBalance,
  PaymentCreateInput,
} from './types.js';

type DbBillStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

const STATUS_TO_DB: Record<BillStatus, DbBillStatus> = {
  unpaid: 'UNPAID',
  partial: 'PARTIAL',
  paid: 'PAID',
};

const DB_TO_STATUS: Record<DbBillStatus, BillStatus> = {
  UNPAID: 'unpaid',
  PARTIAL: 'partial',
  PAID: 'paid',
};

const MODE_TO_DB: Record<PaymentMode, 'CASH' | 'UPI' | 'BANK'> = {
  cash: 'CASH',
  upi: 'UPI',
  bank: 'BANK',
};

const DB_TO_MODE: Record<string, PaymentMode> = {
  CASH: 'cash',
  UPI: 'upi',
  BANK: 'bank',
};

interface BillRow {
  id: string;
  orderId: string;
  billNumber: string;
  partyId: string;
  orderType: string;
  totalPaise: { toString(): string };
  paidPaise: { toString(): string };
  status: string;
  closed: boolean;
  version: number;
  createdAt: Date;
}

interface PaymentRow {
  id: string;
  billId: string;
  amountPaise: { toString(): string };
  paidOn: Date;
  mode: string;
  note: string | null;
  version: number;
  createdAt: Date;
}

const BILL_SELECT = {
  id: true,
  orderId: true,
  billNumber: true,
  partyId: true,
  orderType: true,
  totalPaise: true,
  paidPaise: true,
  status: true,
  closed: true,
  version: true,
  createdAt: true,
} as const;

const PAYMENT_SELECT = {
  id: true,
  billId: true,
  amountPaise: true,
  paidOn: true,
  mode: true,
  note: true,
  version: true,
  createdAt: true,
} as const;

function toRecord(row: BillRow): BillRecord {
  return {
    id: row.id,
    orderId: row.orderId,
    billNumber: row.billNumber,
    partyId: row.partyId,
    orderType: row.orderType === 'SUPPLIER' ? 'supplier' : 'customer',
    totalPaise: Number(row.totalPaise),
    paidPaise: Number(row.paidPaise),
    status: DB_TO_STATUS[row.status as DbBillStatus],
    closed: row.closed,
    version: row.version,
    createdAt: row.createdAt,
  };
}

function toPaymentRecord(row: PaymentRow): BillPaymentRecord {
  return {
    id: row.id,
    billId: row.billId,
    amountPaise: Number(row.amountPaise),
    paidOn: row.paidOn,
    mode: DB_TO_MODE[row.mode] ?? 'cash',
    note: row.note,
    version: row.version,
    createdAt: row.createdAt,
  };
}

function billNumberFor(sequence: number): string {
  return `B-${String(sequence).padStart(6, '0')}`;
}

export function createPrismaBillStore(): BillStore {
  async function findPaymentRow(shopId: string, paymentId: string): Promise<PaymentRow | null> {
    return db().billPayment.findFirst({
      where: { id: paymentId, deletedAt: null, bill: { shopId, deletedAt: null } },
      select: PAYMENT_SELECT,
    });
  }

  return {
    async list(shopId, filters: BillListFilters) {
      const rows = await db().bill.findMany({
        where: {
          shopId,
          deletedAt: null,
          ...(filters.status === undefined ? {} : { status: STATUS_TO_DB[filters.status] }),
          ...(filters.partyId === undefined ? {} : { partyId: filters.partyId }),
          ...(filters.orderType === undefined
            ? {}
            : { orderType: filters.orderType === 'customer' ? 'CUSTOMER' : 'SUPPLIER' }),
        },
        select: BILL_SELECT,
        orderBy: { createdAt: 'desc' },
      });

      return rows.map(toRecord);
    },

    async find(shopId, billId) {
      const row = await db().bill.findFirst({
        where: { id: billId, shopId, deletedAt: null },
        select: BILL_SELECT,
      });

      return row ? toRecord(row) : null;
    },

    async findByOrder(shopId, orderId) {
      const row = await db().bill.findFirst({
        where: { shopId, orderId, deletedAt: null },
        select: BILL_SELECT,
      });

      return row ? toRecord(row) : null;
    },

    async create(input: CreateBillInput) {
      const existing = await db().bill.findFirst({
        where: { orderId: input.orderId },
        select: BILL_SELECT,
      });

      if (existing) {
        return toRecord(existing);
      }

      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          return await db().$transaction(async (tx) => {
            const count = await tx.bill.count({ where: { shopId: input.shopId } });
            const row = await tx.bill.create({
              data: {
                shopId: input.shopId,
                orderId: input.orderId,
                partyId: input.partyId,
                orderType: input.orderType === 'customer' ? 'CUSTOMER' : 'SUPPLIER',
                billNumber: billNumberFor(count + 1 + attempt),
                totalPaise: input.totalPaise,
                paidPaise: 0,
                status: 'UNPAID',
                closed: false,
              },
              select: BILL_SELECT,
            });

            return toRecord(row);
          });
        } catch (error) {
          const code = (error as { code?: string }).code;

          if (code !== 'P2002') {
            throw error;
          }

          const raced = await db().bill.findFirst({
            where: { orderId: input.orderId },
            select: BILL_SELECT,
          });

          if (raced) {
            return toRecord(raced);
          }
        }
      }

      throw new BillError('bill-not-found', 'Could not allocate a bill number');
    },

    async updateTotals(billId, values) {
      const row = await db().bill.update({
        where: { id: billId },
        data: {
          totalPaise: values.totalPaise,
          paidPaise: values.paidPaise,
          status: STATUS_TO_DB[values.status],
          closed: values.closed,
          version: { increment: 1 },
        },
        select: BILL_SELECT,
      });

      return toRecord(row);
    },

    async setClosed(billId, closed) {
      const row = await db().bill.update({
        where: { id: billId },
        data: { closed, version: { increment: 1 } },
        select: BILL_SELECT,
      });

      return toRecord(row);
    },

    async setParty(billId, partyId) {
      const row = await db().bill.update({
        where: { id: billId },
        data: { partyId, version: { increment: 1 } },
        select: BILL_SELECT,
      });

      return toRecord(row);
    },

    async listPayments(billId) {
      const rows = await db().billPayment.findMany({
        where: { billId, deletedAt: null },
        select: PAYMENT_SELECT,
        orderBy: [{ paidOn: 'asc' }, { createdAt: 'asc' }],
      });

      return rows.map(toPaymentRecord);
    },

    async findPayment(shopId, paymentId) {
      const row = await findPaymentRow(shopId, paymentId);
      return row ? toPaymentRecord(row) : null;
    },

    async createPayment(input: PaymentCreateInput) {
      const row = await db().billPayment.create({
        data: {
          billId: input.billId,
          amountPaise: input.amountPaise,
          paidOn: input.paidOn,
          mode: MODE_TO_DB[input.mode],
          note: input.note,
        },
        select: PAYMENT_SELECT,
      });

      return toPaymentRecord(row);
    },

    async updatePayment(shopId, paymentId, patch: BillPaymentUpdate) {
      const existing = await findPaymentRow(shopId, paymentId);

      if (!existing) {
        throw new BillError('payment-not-found', 'That payment is not in this shop');
      }

      if (existing.version !== patch.version) {
        throw new BillError('payment-stale', 'This payment changed. Refresh to see the latest.');
      }

      const data: Prisma.BillPaymentUncheckedUpdateInput = {
        ...(patch.amountPaise === undefined ? {} : { amountPaise: patch.amountPaise }),
        ...(patch.paidOn === undefined
          ? {}
          : { paidOn: new Date(`${patch.paidOn}T00:00:00.000Z`) }),
        ...(patch.mode === undefined ? {} : { mode: MODE_TO_DB[patch.mode] }),
        ...(patch.note === undefined ? {} : { note: patch.note }),
        version: { increment: 1 },
      };

      const row = await db().billPayment.update({
        where: { id: paymentId },
        data,
        select: PAYMENT_SELECT,
      });

      return toPaymentRecord(row);
    },

    async archivePayment(shopId, paymentId, at) {
      const existing = await findPaymentRow(shopId, paymentId);

      if (!existing) {
        throw new BillError('payment-not-found', 'That payment is not in this shop');
      }

      await db().billPayment.update({ where: { id: paymentId }, data: { deletedAt: at } });
    },

    async sumPayments(billId) {
      const total = await db().billPayment.aggregate({
        where: { billId, deletedAt: null },
        _sum: { amountPaise: true },
      });

      return Number(total._sum.amountPaise ?? 0);
    },

    async outstandingByParty(shopId) {
      const rows = await db().bill.findMany({
        where: { shopId, deletedAt: null },
        select: { partyId: true, orderType: true, totalPaise: true, paidPaise: true },
      });

      const balances = new Map<string, PartyBalance>();

      for (const row of rows) {
        const current = balances.get(row.partyId) ?? { receivablePaise: 0, payablePaise: 0 };
        const due = Number(row.totalPaise) - Number(row.paidPaise);

        if (row.orderType === 'CUSTOMER') {
          current.receivablePaise += due;
        } else {
          current.payablePaise += due;
        }

        balances.set(row.partyId, current);
      }

      return balances;
    },

    async archive(shopId, billId, at) {
      await db().$transaction(async (tx) => {
        await tx.bill.updateMany({ where: { id: billId, shopId }, data: { deletedAt: at } });
        await tx.billPayment.updateMany({
          where: { billId, deletedAt: null },
          data: { deletedAt: at },
        });
      });
    },

    async recordAudit(entry: BillAuditWrite) {
      await db().auditEntry.create({
        data: {
          shopId: entry.shopId,
          ownerId: entry.ownerId,
          source: entry.source,
          operation: entry.operation,
          entityType: entry.entityType,
          entityId: entry.entityId,
          ...(entry.before === undefined ? {} : { before: entry.before as Prisma.InputJsonValue }),
          ...(entry.after === undefined ? {} : { after: entry.after as Prisma.InputJsonValue }),
        },
      });
    },
  };
}
