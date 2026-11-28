import {
  apiErrorSchema,
  auditListSchema,
  billDetailEnvelopeSchema,
  billListSchema,
  billWriteResultSchema,
  dashboardSummarySchema,
  itemListSchema,
  itemWithStockSchema,
  orderListSchema,
  orderWithPartySchema,
  partyListSchema,
  partySchema,
  partyWithBalanceSchema,
  sessionSchema,
  stockMovementListSchema,
  stockWriteResultSchema,
  type AuditEntryDto,
  type BillDetailDto,
  type BillDto,
  type BillPaymentDto,
  type BillPaymentInput,
  type BillPaymentUpdate,
  type BillWithPaymentsDto,
  type DashboardSummaryDto,
  type ItemInput,
  type ItemUpdate,
  type ItemWithStockDto,
  type OrderInput,
  type OrderUpdate,
  type OrderWithPartyDto,
  type PartyInput,
  type PartyType,
  type PartyUpdate,
  type PartyWithBalanceDto,
  type Session,
  type StockAdjustRequest,
  type StockMovementDto,
  type StockReceiveRequest,
  type StockWriteResult,
} from '@sauda/shared';
import { z } from 'zod';
import { API_BASE_URL } from './api-config.js';

const BASE_URL = API_BASE_URL || 'https://api.sauda.thedeploymentlab.app';

const itemEnvelopeSchema = z.object({ item: itemWithStockSchema });
const partyEnvelopeSchema = z.object({ party: partyWithBalanceSchema });
const partyDetailSchema = z.object({
  party: partyWithBalanceSchema,
  bills: billListSchema.shape.bills,
});
const orderEnvelopeSchema = z.object({ order: orderWithPartySchema });
const orderWriteEnvelopeSchema = z.object({
  order: orderWithPartySchema,
  bill: billWriteResultSchema.shape.bill.optional(),
});

export type BillWithParty = BillDto & { partyName: string };
export type ComposedBill = BillWithPaymentsDto & { partyName: string };

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterSeconds: number | undefined;

  constructor(status: number, code: string, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');

  if (init.body !== undefined) {
    headers.set('content-type', 'application/json');
  }

  if (authToken) {
    headers.set('authorization', `Bearer ${authToken}`);
  }

  return fetch(`${BASE_URL}${path}`, { ...init, headers });
}

async function failure(response: Response): Promise<ApiError> {
  let body: unknown;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  const parsed = apiErrorSchema.safeParse(body);

  if (parsed.success) {
    return new ApiError(
      response.status,
      parsed.data.code,
      parsed.data.message,
      parsed.data.retryAfterSeconds,
    );
  }

  return new ApiError(response.status, 'request-failed', 'Something went wrong');
}

async function json<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  if (!response.ok) {
    throw await failure(response);
  }

  return schema.parse(await response.json());
}

async function send(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<Response> {
  return request(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function queryString(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, value);
    }
  }

  const text = search.toString();
  return text === '' ? '' : `?${text}`;
}

export const api = {
  async signUp(shopName: string, password: string): Promise<Session> {
    return json(await send('/auth/signup', 'POST', { shopName, password }), sessionSchema);
  },

  async signIn(shopName: string, password: string, deviceLabel?: string): Promise<Session> {
    return json(
      await send('/auth/signin', 'POST', {
        shopName,
        password,
        ...(deviceLabel === undefined ? {} : { deviceLabel }),
      }),
      sessionSchema,
    );
  },

  async me(): Promise<{ shop: { id: string; name: string }; owner: { id: string } }> {
    const response = await request('/auth/me');

    if (!response.ok) {
      throw await failure(response);
    }

    return (await response.json()) as { shop: { id: string; name: string }; owner: { id: string } };
  },

  async logout(): Promise<void> {
    const response = await send('/auth/logout', 'POST');

    if (!response.ok && response.status !== 401) {
      throw await failure(response);
    }
  },

  // Items -----------------------------------------------------------------
  async listItems(): Promise<ItemWithStockDto[]> {
    return json(await request('/items'), itemListSchema).then((body) => body.items);
  },

  async createItem(input: ItemInput): Promise<ItemWithStockDto> {
    return json(await send('/items', 'POST', input), itemEnvelopeSchema).then((body) => body.item);
  },

  async updateItem(itemId: string, patch: ItemUpdate): Promise<ItemWithStockDto> {
    return json(await send(`/items/${itemId}`, 'PATCH', patch), itemEnvelopeSchema).then(
      (body) => body.item,
    );
  },

  async archiveItem(itemId: string): Promise<void> {
    const response = await send(`/items/${itemId}`, 'DELETE');

    if (!response.ok) {
      throw await failure(response);
    }
  },

  // Stock -----------------------------------------------------------------
  async listMovements(itemId: string): Promise<StockMovementDto[]> {
    return json(
      await request(`/stock/movements?itemId=${encodeURIComponent(itemId)}`),
      stockMovementListSchema,
    ).then((body) => body.movements);
  },

  async receiveStock(input: StockReceiveRequest): Promise<StockWriteResult> {
    return json(await send('/stock/receive', 'POST', input), stockWriteResultSchema);
  },

  async adjustStock(input: StockAdjustRequest): Promise<StockWriteResult> {
    return json(await send('/stock/adjust', 'POST', input), stockWriteResultSchema);
  },

  // Parties ---------------------------------------------------------------
  async listParties(params: { type?: PartyType; search?: string } = {}): Promise<
    PartyWithBalanceDto[]
  > {
    return json(
      await request(`/parties${queryString({ type: params.type, search: params.search })}`),
      partyListSchema,
    ).then((body) => body.parties);
  },

  async getParty(
    partyId: string,
  ): Promise<{ party: PartyWithBalanceDto; bills: BillWithParty[] }> {
    return json(await request(`/parties/${partyId}`), partyDetailSchema);
  },

  async createParty(input: PartyInput): Promise<PartyWithBalanceDto> {
    return json(await send('/parties', 'POST', input), partyEnvelopeSchema).then(
      (body) => body.party,
    );
  },

  async updateParty(partyId: string, patch: PartyUpdate): Promise<PartyWithBalanceDto> {
    const body = await json(await send(`/parties/${partyId}`, 'PATCH', patch), z.object({
      party: partySchema,
    }));

    return { ...body.party, receivablePaise: 0, payablePaise: 0 };
  },

  async archiveParty(partyId: string): Promise<void> {
    const response = await send(`/parties/${partyId}`, 'DELETE');

    if (!response.ok) {
      throw await failure(response);
    }
  },

  // Orders ----------------------------------------------------------------
  async listOrders(
    params: { type?: PartyType; status?: string; partyId?: string; search?: string } = {},
  ): Promise<OrderWithPartyDto[]> {
    return json(
      await request(
        `/orders${queryString({
          type: params.type,
          status: params.status,
          partyId: params.partyId,
          search: params.search,
        })}`,
      ),
      orderListSchema,
    ).then((body) => body.orders);
  },

  async getOrder(orderId: string): Promise<OrderWithPartyDto> {
    return json(await request(`/orders/${orderId}`), orderEnvelopeSchema).then((body) => body.order);
  },

  async createOrder(
    input: OrderInput,
  ): Promise<{ order: OrderWithPartyDto; bill?: ComposedBill }> {
    const body = await json(await send('/orders', 'POST', input), orderWriteEnvelopeSchema);

    return body.bill === undefined ? { order: body.order } : { order: body.order, bill: body.bill };
  },

  async updateOrder(orderId: string, patch: OrderUpdate): Promise<OrderWithPartyDto> {
    return json(await send(`/orders/${orderId}`, 'PATCH', patch), orderEnvelopeSchema).then(
      (body) => body.order,
    );
  },

  async fulfilOrder(orderId: string): Promise<ComposedBill> {
    return json(await send(`/orders/${orderId}/fulfil`, 'POST'), billWriteResultSchema).then(
      (body) => body.bill,
    );
  },

  async deleteOrder(orderId: string): Promise<void> {
    const response = await send(`/orders/${orderId}`, 'DELETE');

    if (!response.ok) {
      throw await failure(response);
    }
  },

  // Bills and payments ----------------------------------------------------
  async listBills(
    params: { status?: string; type?: PartyType; partyId?: string; search?: string } = {},
  ): Promise<BillWithParty[]> {
    return json(
      await request(
        `/bills${queryString({
          status: params.status,
          type: params.type,
          partyId: params.partyId,
          search: params.search,
        })}`,
      ),
      billListSchema,
    ).then((body) => body.bills);
  },

  async getBill(billId: string): Promise<BillDetailDto> {
    return json(await request(`/bills/${billId}`), billDetailEnvelopeSchema).then(
      (body) => body.bill,
    );
  },

  async addPayment(billId: string, input: BillPaymentInput): Promise<ComposedBill> {
    return json(await send(`/bills/${billId}/payments`, 'POST', input), billWriteResultSchema).then(
      (body) => body.bill,
    );
  },

  async updatePayment(
    paymentId: string,
    patch: BillPaymentUpdate,
  ): Promise<ComposedBill> {
    return json(await send(`/payments/${paymentId}`, 'PATCH', patch), billWriteResultSchema).then(
      (body) => body.bill,
    );
  },

  async deletePayment(paymentId: string): Promise<ComposedBill> {
    return json(await send(`/payments/${paymentId}`, 'DELETE'), billWriteResultSchema).then(
      (body) => body.bill,
    );
  },

  async reopenBill(billId: string): Promise<ComposedBill> {
    return json(await send(`/bills/${billId}/reopen`, 'POST'), billWriteResultSchema).then(
      (body) => body.bill,
    );
  },

  // Dashboard and history -------------------------------------------------
  async dashboardSummary(): Promise<DashboardSummaryDto> {
    return json(await request('/dashboard/summary'), dashboardSummarySchema);
  },

  async listAudit(params: {
    entityType?: string;
    entityId?: string;
    limit?: number;
  } = {}): Promise<AuditEntryDto[]> {
    return json(
      await request(
        `/audit${queryString({
          entityType: params.entityType,
          entityId: params.entityId,
          limit: params.limit === undefined ? undefined : String(params.limit),
        })}`,
      ),
      auditListSchema,
    ).then((body) => body.entries);
  },
};

export type { BillPaymentDto };
