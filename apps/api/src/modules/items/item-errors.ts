export type ItemErrorCode = 'item-exists' | 'item-not-found';

const STATUS: Record<ItemErrorCode, number> = {
  'item-exists': 409,
  'item-not-found': 404,
};

export class ItemError extends Error {
  readonly code: ItemErrorCode;
  readonly status: number;

  constructor(code: ItemErrorCode, message: string) {
    super(message);
    this.name = 'ItemError';
    this.code = code;
    this.status = STATUS[code];
  }
}
