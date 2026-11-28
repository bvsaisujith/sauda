export type OrderErrorCode = 'order-not-found' | 'order-stale' | 'order-not-pending';

const STATUS: Record<OrderErrorCode, number> = {
  'order-not-found': 404,
  'order-stale': 409,
  'order-not-pending': 409,
};

export class OrderError extends Error {
  readonly code: OrderErrorCode;
  readonly status: number;

  constructor(code: OrderErrorCode, message: string) {
    super(message);
    this.name = 'OrderError';
    this.code = code;
    this.status = STATUS[code];
  }
}
