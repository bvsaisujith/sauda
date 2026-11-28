import type { OrderLineInput, OrderStatus, PartyType } from '@sauda/shared';

export type OrderSource = 'TOUCH' | 'VOICE' | 'SYSTEM';

export interface OrderActor {
  shopId: string;
  ownerId: string;
  source: OrderSource;
}

export interface OrderLineRecord {
  id: string;
  itemId: string;
  quantity: number;
  ratePaise: number;
  lineTotalPaise: number;
}

export interface OrderRecord {
  id: string;
  type: PartyType;
  partyId: string;
  orderDate: Date;
  status: OrderStatus;
  totalPaise: number;
  notes: string | null;
  version: number;
  createdAt: Date;
  billId: string | null;
}

export interface OrderWithLines {
  order: OrderRecord;
  lines: OrderLineRecord[];
}

export interface OrderListFilters {
  type?: PartyType;
  status?: OrderStatus;
  partyId?: string;
}

export interface NormalisedLine {
  itemId: string;
  quantity: number;
  ratePaise: number;
  lineTotalPaise: number;
}

export interface OrderAuditWrite {
  shopId: string;
  ownerId: string;
  source: OrderSource;
  operation: string;
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface OrderStore {
  list(shopId: string, filters: OrderListFilters): Promise<OrderWithLines[]>;
  find(shopId: string, orderId: string): Promise<OrderWithLines | null>;
  create(
    shopId: string,
    input: {
      type: PartyType;
      partyId: string;
      orderDate: Date;
      notes: string | null;
      lines: NormalisedLine[];
      totalPaise: number;
    },
  ): Promise<OrderWithLines>;
  update(
    shopId: string,
    orderId: string,
    values: {
      partyId?: string;
      orderDate?: Date;
      notes?: string | null;
      lines: NormalisedLine[];
      totalPaise: number;
      version: number;
    },
  ): Promise<OrderWithLines>;
  setStatus(shopId: string, orderId: string, status: OrderStatus): Promise<void>;
  archive(shopId: string, orderId: string, at: Date): Promise<void>;
  recordAudit(entry: OrderAuditWrite): Promise<void>;
}

export type { OrderLineInput };
