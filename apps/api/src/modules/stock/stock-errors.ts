export type StockErrorCode = 'insufficient-stock' | 'item-archived';

const STATUS: Record<StockErrorCode, number> = {
  'insufficient-stock': 409,
  'item-archived': 409,
};

export class StockError extends Error {
  readonly code: StockErrorCode;
  readonly status: number;

  constructor(code: StockErrorCode, message: string) {
    super(message);
    this.name = 'StockError';
    this.code = code;
    this.status = STATUS[code];
  }
}

/** Raised inside the store's transaction so a failed adjust writes nothing. */
export class InsufficientStockError extends Error {
  readonly available: number;

  constructor(available: number) {
    super('Not enough stock on hand for that adjustment');
    this.name = 'InsufficientStockError';
    this.available = available;
  }
}
