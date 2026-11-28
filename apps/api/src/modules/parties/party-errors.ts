export type PartyErrorCode = 'party-not-found' | 'party-exists';

const STATUS: Record<PartyErrorCode, number> = {
  'party-not-found': 404,
  'party-exists': 409,
};

export class PartyError extends Error {
  readonly code: PartyErrorCode;
  readonly status: number;

  constructor(code: PartyErrorCode, message: string) {
    super(message);
    this.name = 'PartyError';
    this.code = code;
    this.status = STATUS[code];
  }
}
