import {
  billStatus,
  type BillDto,
  type BillPaymentDto,
  type BillPaymentInput,
  type BillPaymentUpdate,
  type BillStatus,
} from '@sauda/shared';
import { BillError } from './bill-errors.js';
import { toBillDto, toPaymentDto } from './bill-dto.js';
import type {
  BillActor,
  BillListFilters,
  BillRecord,
  BillStore,
  CreateBillInput,
  PartyBalance,
} from './types.js';

export interface BillWithPayments {
  bill: BillDto;
  payments: BillPaymentDto[];
}

export interface BillSummary {
  todaySalesPaise: number;
  todayPurchasesPaise: number;
  receivablePaise: number;
  payablePaise: number;
  billCounts: Record<BillStatus, number>;
}

export interface BillsService {
  list(shopId: string, filters?: BillListFilters): Promise<BillDto[]>;
  get(shopId: string, billId: string): Promise<BillWithPayments>;
  findByOrder(shopId: string, orderId: string): Promise<BillDto | null>;
  createForOrder(actor: BillActor, input: CreateBillInput): Promise<BillDto>;
  addPayment(actor: BillActor, billId: string, input: BillPaymentInput): Promise<BillWithPayments>;
  updatePayment(
    actor: BillActor,
    paymentId: string,
    patch: BillPaymentUpdate,
  ): Promise<BillWithPayments>;
  deletePayment(actor: BillActor, paymentId: string): Promise<BillWithPayments>;
  reopen(actor: BillActor, billId: string): Promise<BillWithPayments>;
  syncOrderTotal(actor: BillActor, orderId: string, totalPaise: number): Promise<void>;
  syncOrderParty(actor: BillActor, orderId: string, partyId: string): Promise<void>;
  removeForOrder(actor: BillActor, orderId: string): Promise<void>;
  outstandingByParty(shopId: string): Promise<Map<string, PartyBalance>>;
  summary(shopId: string, today?: Date): Promise<BillSummary>;
}

function billSnapshot(record: BillRecord): Record<string, unknown> {
  return {
    billNumber: record.billNumber,
    orderId: record.orderId,
    totalPaise: record.totalPaise,
    paidPaise: record.paidPaise,
    status: record.status,
    closed: record.closed,
  };
}

function startOfUtcDay(day: Date): Date {
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
}

export function createBillsService(store: BillStore): BillsService {
  async function requireBill(shopId: string, billId: string): Promise<BillRecord> {
    const bill = await store.find(shopId, billId);

    if (!bill) {
      throw new BillError('bill-not-found', 'That bill is not in this shop');
    }

    return bill;
  }

  async function load(shopId: string, billId: string): Promise<BillWithPayments> {
    const bill = await requireBill(shopId, billId);
    const payments = await store.listPayments(bill.id);
    return { bill: toBillDto(bill), payments: payments.map(toPaymentDto) };
  }

  /** Recompute paid, status and closed from the payments actually on the bill. */
  async function recalc(shopId: string, billId: string): Promise<BillRecord> {
    const bill = await requireBill(shopId, billId);
    const paidPaise = await store.sumPayments(bill.id);
    const status = billStatus(bill.totalPaise, paidPaise);

    return store.updateTotals(bill.id, {
      totalPaise: bill.totalPaise,
      paidPaise,
      status,
      closed: status === 'paid',
    });
  }

  async function requireOpenBill(shopId: string, billId: string): Promise<BillRecord> {
    const bill = await requireBill(shopId, billId);

    if (bill.closed) {
      throw new BillError(
        'bill-closed',
        'This bill is fully paid and closed. Reopen it before changing payments.',
      );
    }

    return bill;
  }

  return {
    async list(shopId, filters) {
      const records = await store.list(shopId, filters ?? {});
      return records.map(toBillDto);
    },

    async get(shopId, billId) {
      return load(shopId, billId);
    },

    async findByOrder(shopId, orderId) {
      const bill = await store.findByOrder(shopId, orderId);
      return bill ? toBillDto(bill) : null;
    },

    async createForOrder(actor, input) {
      const bill = await store.create(input);

      await store.recordAudit({
        shopId: actor.shopId,
        ownerId: actor.ownerId,
        source: actor.source,
        operation: 'bills.create',
        entityType: 'Bill',
        entityId: bill.id,
        after: billSnapshot(bill),
      });

      return toBillDto(bill);
    },

    async addPayment(actor, billId, input) {
      const bill = await requireOpenBill(actor.shopId, billId);
      const before = billSnapshot(bill);

      const payment = await store.createPayment({
        billId: bill.id,
        amountPaise: input.amountPaise,
        paidOn: new Date(`${input.paidOn}T00:00:00.000Z`),
        mode: input.mode,
        note: input.note,
      });

      const updated = await recalc(actor.shopId, bill.id);

      // One entry for the bill: what changed, and which payment caused it.
      await store.recordAudit({
        shopId: actor.shopId,
        ownerId: actor.ownerId,
        source: actor.source,
        operation: 'bills.payment.add',
        entityType: 'Bill',
        entityId: bill.id,
        before,
        after: { ...billSnapshot(updated), paymentId: payment.id, amountPaise: payment.amountPaise },
      });

      return load(actor.shopId, bill.id);
    },

    async updatePayment(actor, paymentId, patch) {
      const existing = await store.findPayment(actor.shopId, paymentId);

      if (!existing) {
        throw new BillError('payment-not-found', 'That payment is not in this shop');
      }

      const bill = await requireOpenBill(actor.shopId, existing.billId);
      const before = billSnapshot(bill);

      const payment = await store.updatePayment(actor.shopId, paymentId, patch);
      const updated = await recalc(actor.shopId, existing.billId);

      await store.recordAudit({
        shopId: actor.shopId,
        ownerId: actor.ownerId,
        source: actor.source,
        operation: 'bills.payment.update',
        entityType: 'Bill',
        entityId: updated.id,
        before: { ...before, paymentId: payment.id, amountPaise: existing.amountPaise },
        after: { ...billSnapshot(updated), paymentId: payment.id, amountPaise: payment.amountPaise },
      });

      return load(actor.shopId, updated.id);
    },

    async deletePayment(actor, paymentId) {
      const existing = await store.findPayment(actor.shopId, paymentId);

      if (!existing) {
        throw new BillError('payment-not-found', 'That payment is not in this shop');
      }

      const bill = await requireOpenBill(actor.shopId, existing.billId);
      const before = billSnapshot(bill);

      await store.archivePayment(actor.shopId, paymentId, new Date());
      const updated = await recalc(actor.shopId, existing.billId);

      await store.recordAudit({
        shopId: actor.shopId,
        ownerId: actor.ownerId,
        source: actor.source,
        operation: 'bills.payment.delete',
        entityType: 'Bill',
        entityId: updated.id,
        before: { ...before, paymentId: existing.id, amountPaise: existing.amountPaise },
        after: billSnapshot(updated),
      });

      return load(actor.shopId, updated.id);
    },

    async reopen(actor, billId) {
      const bill = await requireBill(actor.shopId, billId);

      if (!bill.closed) {
        return load(actor.shopId, bill.id);
      }

      const updated = await store.setClosed(bill.id, false);

      await store.recordAudit({
        shopId: actor.shopId,
        ownerId: actor.ownerId,
        source: actor.source,
        operation: 'bills.reopen',
        entityType: 'Bill',
        entityId: bill.id,
        before: billSnapshot(bill),
        after: billSnapshot(updated),
      });

      return load(actor.shopId, bill.id);
    },

    async syncOrderTotal(actor, orderId, totalPaise) {
      const bill = await store.findByOrder(actor.shopId, orderId);

      if (!bill) {
        return;
      }

      const paidPaise = await store.sumPayments(bill.id);
      const status = billStatus(totalPaise, paidPaise);

      const updated = await store.updateTotals(bill.id, {
        totalPaise,
        paidPaise,
        status,
        closed: status === 'paid',
      });

      await store.recordAudit({
        shopId: actor.shopId,
        ownerId: actor.ownerId,
        source: actor.source,
        operation: 'bills.update-total',
        entityType: 'Bill',
        entityId: bill.id,
        before: billSnapshot(bill),
        after: billSnapshot(updated),
      });
    },

    async syncOrderParty(actor, orderId, partyId) {
      const bill = await store.findByOrder(actor.shopId, orderId);

      if (!bill || bill.partyId === partyId) {
        return;
      }

      const updated = await store.setParty(bill.id, partyId);

      await store.recordAudit({
        shopId: actor.shopId,
        ownerId: actor.ownerId,
        source: actor.source,
        operation: 'bills.update-party',
        entityType: 'Bill',
        entityId: bill.id,
        before: { partyId: bill.partyId },
        after: { partyId: updated.partyId },
      });
    },

    async removeForOrder(actor, orderId) {
      const bill = await store.findByOrder(actor.shopId, orderId);

      if (!bill) {
        return;
      }

      await store.archive(actor.shopId, bill.id, new Date());

      await store.recordAudit({
        shopId: actor.shopId,
        ownerId: actor.ownerId,
        source: actor.source,
        operation: 'bills.delete',
        entityType: 'Bill',
        entityId: bill.id,
        before: billSnapshot(bill),
      });
    },

    async outstandingByParty(shopId) {
      return store.outstandingByParty(shopId);
    },

    async summary(shopId, today = new Date()) {
      const bills = await store.list(shopId, {});
      const dayStart = startOfUtcDay(today);

      const summary: BillSummary = {
        todaySalesPaise: 0,
        todayPurchasesPaise: 0,
        receivablePaise: 0,
        payablePaise: 0,
        billCounts: { unpaid: 0, partial: 0, paid: 0 },
      };

      for (const bill of bills) {
        summary.billCounts[bill.status] += 1;

        const due = bill.totalPaise - bill.paidPaise;

        if (bill.orderType === 'customer') {
          summary.receivablePaise += due;
        } else {
          summary.payablePaise += due;
        }

        if (bill.createdAt >= dayStart) {
          if (bill.orderType === 'customer') {
            summary.todaySalesPaise += bill.totalPaise;
          } else {
            summary.todayPurchasesPaise += bill.totalPaise;
          }
        }
      }

      return summary;
    },
  };
}
