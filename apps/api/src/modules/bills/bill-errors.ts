export type BillErrorCode =
  | 'bill-not-found'
  | 'payment-not-found'
  | 'bill-closed'
  | 'bill-stale'
  | 'payment-stale';

const STATUS: Record<BillErrorCode, number> = {
  'bill-not-found': 404,
  'payment-not-found': 404,
  'bill-closed': 409,
  'bill-stale': 409,
  'payment-stale': 409,
};

export class BillError extends Error {
  readonly code: BillErrorCode;
  readonly status: number;

  constructor(code: BillErrorCode, message: string) {
    super(message);
    this.name = 'BillError';
    this.code = code;
    this.status = STATUS[code];
  }
}
