import { authErrorSchema, sessionSchema, type Session } from '@sauda/shared';
import { API_BASE_URL } from './api-config.js';

const BASE_URL = API_BASE_URL || 'https://api.sauda.thedeploymentlab.app';

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

  const parsed = authErrorSchema.safeParse(body);

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

async function postJson(path: string, body: unknown): Promise<Response> {
  return request(path, { method: 'POST', body: JSON.stringify(body) });
}

export const api = {
  async signUp(shopName: string, password: string): Promise<Session> {
    const response = await postJson('/auth/signup', { shopName, password });

    if (!response.ok) {
      throw await failure(response);
    }

    return sessionSchema.parse(await response.json());
  },

  async signIn(shopName: string, password: string, deviceLabel?: string): Promise<Session> {
    const response = await postJson('/auth/signin', {
      shopName,
      password,
      ...(deviceLabel === undefined ? {} : { deviceLabel }),
    });

    if (!response.ok) {
      throw await failure(response);
    }

    return sessionSchema.parse(await response.json());
  },

  async me(): Promise<{ shop: { id: string; name: string }; owner: { id: string } }> {
    const response = await request('/auth/me');

    if (!response.ok) {
      throw await failure(response);
    }

    return (await response.json()) as { shop: { id: string; name: string }; owner: { id: string } };
  },

  async logout(): Promise<void> {
    const response = await request('/auth/logout', { method: 'POST' });

    if (!response.ok && response.status !== 401) {
      throw await failure(response);
    }
  },
};
