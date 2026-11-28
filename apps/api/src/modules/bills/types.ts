import type {
  BillPaymentInput,
  BillPaymentUpdate,
  BillStatus,
  PartyType,
  PaymentMode,
} from '@sauda/shared';

export type BillSource = 'TOUCH' | 'VOICE' | 'SYSTEM';

export interface BillActor {
  shopId: string;
  ownerId: string;
  source: BillSource;
}

export interface BillRecord {
  id: string;
  orderId: string;
  billNumber: string;
  partyId: string;
  orderType: PartyType;
  totalPaise: number;
  paidPaise: number;
  status: BillStatus;
  closed: boolean;
  version: number;
  createdAt: Date;
}

export interface BillPaymentRecord {
  id: string;
  billId: string;
  amountPaise: number;
  paidOn: Date;
  mode: PaymentMode;
  note: string | null;
  version: number;
  createdAt: Date;
}

export interface CreateBillInput {
  shopId: string;
  orderId: string;
  partyId: string;
  orderType: PartyType;
  totalPaise: number;
}

export interface PaymentCreateInput {
  billId: string;
  amountPaise: number;
  paidOn: Date;
  mode: PaymentMode;
  note: string | null;
}

export interface BillListFilters {
  status?: BillStatus;
  partyId?: string;
  orderType?: PartyType;
}

export interface BillAuditWrite {
  shopId: string;
  ownerId: string;
  source: BillSource;
  operation: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface PartyBalance {
  receivablePaise: number;
  payablePaise: number;
}

export interface BillStore {
  list(shopId: string, filters: BillListFilters): Promise<BillRecord[]>;
  find(shopId: string, billId: string): Promise<BillRecord | null>;
  findByOrder(shopId: string, orderId: string): Promise<BillRecord | null>;
  create(input: CreateBillInput): Promise<BillRecord>;
  updateTotals(
    billId: string,
    values: { totalPaise: number; paidPaise: number; status: BillStatus; closed: boolean },
  ): Promise<BillRecord>;
  setClosed(billId: string, closed: boolean): Promise<BillRecord>;
  setParty(billId: string, partyId: string): Promise<BillRecord>;
  listPayments(billId: string): Promise<BillPaymentRecord[]>;
  findPayment(shopId: string, paymentId: string): Promise<BillPaymentRecord | null>;
  createPayment(input: PaymentCreateInput): Promise<BillPaymentRecord>;
  updatePayment(
    shopId: string,
    paymentId: string,
    patch: BillPaymentUpdate,
  ): Promise<BillPaymentRecord>;
  archivePayment(shopId: string, paymentId: string, at: Date): Promise<void>;
  sumPayments(billId: string): Promise<number>;
  outstandingByParty(shopId: string): Promise<Map<string, PartyBalance>>;
  archive(shopId: string, billId: string, at: Date): Promise<void>;
  recordAudit(entry: BillAuditWrite): Promise<void>;
}

export type { BillPaymentInput };
