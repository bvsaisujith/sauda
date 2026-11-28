import type { PartyDto } from '@sauda/shared';
import type { PartyRecord } from './types.js';

export function toPartyDto(record: PartyRecord): PartyDto {
  return {
    id: record.id,
    type: record.type,
    name: record.name,
    phone: record.phone,
    address: record.address,
    notes: record.notes,
    archivedAt: record.archivedAt === null ? null : record.archivedAt.toISOString(),
  };
}
