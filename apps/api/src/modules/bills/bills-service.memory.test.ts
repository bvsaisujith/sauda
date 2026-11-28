import { describe, expect, it } from 'vitest';
import type { BillPaymentRecord, BillRecord, BillStore, PartyBalance } from './types.js';
import { createBillsService } from './bills-service.js';
import { BillError } from './bill-errors.js';

const actor = { shopId: 'shop_1', ownerId: 'owner_1', source: 'TOUCH' as const };

function billRecord(overrides: Partial<BillRecord> = {}): BillRecord {
  return {
    id: 'bill_1',
    orderId: 'order_1',
    billNumber: 'B-000001',
    partyId: 'party_1',
    orderType: 'customer',
    totalPaise: 50_000,
    paidPaise: 0,
    status: 'unpaid',
    closed: false,
    version: 1,
    createdAt: new Date('2026-11-20T10:00:00.000Z'),
    ...overrides,
  };
}

function paymentRecord(overrides: Partial<BillPaymentRecord> = {}): BillPaymentRecord {
  return {
    id: 'payment_1',
    billId: 'bill_1',
    amountPaise: 20_000,
    paidOn: new Date('2026-11-21T00:00:00.000Z'),
    mode: 'cash',
    note: null,
    version: 1,
    createdAt: new Date('2026-11-21T09:00:00.000Z'),
    ...overrides,
  };
}

function createMemoryStore(initial: BillRecord = billRecord()) {
  let bill = initial;
  const payments: BillPaymentRecord[] = [];
  const audits: unknown[] = [];

  const store: BillStore = {
    async list() {
      return [bill];
    },
    async find() {
      return bill;
    },
    async findByOrder() {
      return bill;
    },
    async create() {
      return bill;
    },
    async updateTotals(_billId, values) {
      bill = { ...bill, ...values, version: bill.version + 1 };
      return bill;
    },
    async setClosed(_billId, closed) {
      bill = { ...bill, closed, version: bill.version + 1 };
      return bill;
    },
    async setParty(_billId, partyId) {
      bill = { ...bill, partyId, version: bill.version + 1 };
      return bill;
    },
    async listPayments() {
      return [...payments];
    },
    async findPayment(_shopId, paymentId) {
      return payments.find((payment) => payment.id === paymentId) ?? null;
    },
    async createPayment(input) {
      const payment = paymentRecord({
        id: `payment_${payments.length + 1}`,
        billId: input.billId,
        amountPaise: input.amountPaise,
        paidOn: input.paidOn,
        mode: input.mode,
        note: input.note,
      });
      payments.push(payment);
      return payment;
    },
    async updatePayment(_shopId, paymentId, patch) {
      const index = payments.findIndex((payment) => payment.id === paymentId);

      if (index < 0) {
        throw new Error('missing payment');
      }

      if (patch.version !== payments[index]!.version) {
        throw new BillError('payment-stale', 'This payment changed. Refresh to see the latest.');
      }

      const updated: BillPaymentRecord = {
        ...payments[index]!,
        amountPaise: patch.amountPaise ?? payments[index]!.amountPaise,
        mode: patch.mode ?? payments[index]!.mode,
        note: patch.note === undefined ? payments[index]!.note : patch.note,
        version: payments[index]!.version + 1,
      };

      payments[index] = updated;
      return updated;
    },
    async archivePayment(_shopId, paymentId) {
      const index = payments.findIndex((payment) => payment.id === paymentId);
      payments.splice(index, 1);
    },
    async sumPayments() {
      return payments.reduce((total, payment) => total + payment.amountPaise, 0);
    },
    async outstandingByParty(): Promise<Map<string, PartyBalance>> {
      return new Map();
    },
    async archive() {
      // not used in these tests
    },
    async recordAudit(entry) {
      audits.push(entry);
    },
  };

  return { store, audits, getBill: () => bill, payments };
}

const payment = (amountPaise: number): { amountPaise: number; paidOn: string; mode: 'cash'; note: null } => ({
  amountPaise,
  paidOn: '2026-11-21',
  mode: 'cash',
  note: null,
});

describe('bills service', () => {
  it('marks a bill partial after the first payment', async () => {
    const { store, getBill } = createMemoryStore();
    const service = createBillsService(store);

    const result = await service.addPayment(actor, 'bill_1', payment(20_000));

    expect(result.bill.paidPaise).toBe(20_000);
    expect(result.bill.balancePaise).toBe(30_000);
    expect(result.bill.status).toBe('partial');
    expect(getBill().closed).toBe(false);
  });

  it('closes a bill once the payments cover the total', async () => {
    const { store, getBill } = createMemoryStore();
    const service = createBillsService(store);

    await service.addPayment(actor, 'bill_1', payment(50_000));

    expect(getBill().status).toBe('paid');
    expect(getBill().closed).toBe(true);
  });

  it('rejects a payment on a closed bill', async () => {
    const { store } = createMemoryStore(billRecord({ paidPaise: 50_000, status: 'paid', closed: true }));
    const service = createBillsService(store);

    await expect(service.addPayment(actor, 'bill_1', payment(1_000))).rejects.toMatchObject({
      code: 'bill-closed',
      status: 409,
    });
  });

  it('reopens a closed bill so payments can change again', async () => {
    const { store, getBill } = createMemoryStore(
      billRecord({ paidPaise: 50_000, status: 'paid', closed: true }),
    );
    const service = createBillsService(store);

    const result = await service.reopen(actor, 'bill_1');

    expect(result.bill.closed).toBe(false);
    expect(getBill().closed).toBe(false);
  });

  it('recalculates the status when a payment is edited', async () => {
    const { store, getBill } = createMemoryStore();
    const service = createBillsService(store);

    const created = await service.addPayment(actor, 'bill_1', payment(20_000));
    const createdPayment = created.payments[0]!;

    const updated = await service.updatePayment(actor, createdPayment.id, {
      amountPaise: 10_000,
      version: createdPayment.version,
    });

    expect(updated.bill.paidPaise).toBe(10_000);
    expect(updated.bill.status).toBe('partial');
    expect(getBill().closed).toBe(false);
  });

  it('reopens the bill automatically when an edit makes it unpaid again', async () => {
    const { store, getBill } = createMemoryStore();
    const service = createBillsService(store);

    // A full payment closes the bill; reopening makes it editable again.
    await service.addPayment(actor, 'bill_1', payment(50_000));
    expect(getBill().closed).toBe(true);
    await service.reopen(actor, 'bill_1');

    const result = await service.updatePayment(actor, 'payment_1', { amountPaise: 5_000, version: 1 });

    expect(result.bill.status).toBe('partial');
    expect(result.bill.closed).toBe(false);
    expect(getBill().closed).toBe(false);
  });

  it('refuses a stale payment edit', async () => {
    const { store } = createMemoryStore();
    const service = createBillsService(store);

    const created = await service.addPayment(actor, 'bill_1', payment(20_000));
    const createdPayment = created.payments[0]!;

    await expect(
      service.updatePayment(actor, createdPayment.id, {
        amountPaise: 10_000,
        version: createdPayment.version + 5,
      }),
    ).rejects.toMatchObject({ code: 'payment-stale' });
  });

  it('recalculates the status when a payment is deleted', async () => {
    const { store, getBill } = createMemoryStore();
    const service = createBillsService(store);

    const created = await service.addPayment(actor, 'bill_1', payment(50_000));
    expect(getBill().closed).toBe(true);

    await service.reopen(actor, 'bill_1');
    const result = await service.deletePayment(actor, created.payments[0]!.id);

    expect(result.bill.paidPaise).toBe(0);
    expect(result.bill.status).toBe('unpaid');
    expect(result.bill.closed).toBe(false);
  });
});