import {
  apiErrorSchema,
  itemListSchema,
  itemWithStockSchema,
  sessionSchema,
  stockMovementListSchema,
  stockWriteResultSchema,
  type ItemInput,
  type ItemUpdate,
  type ItemWithStockDto,
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
};
