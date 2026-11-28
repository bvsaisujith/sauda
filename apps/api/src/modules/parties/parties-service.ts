import type { PartyDto, PartyInput, PartyType, PartyUpdate } from '@sauda/shared';
import { PartyError } from './party-errors.js';
import { toPartyDto } from './party-dto.js';
import type { PartyActor, PartyRecord, PartyStore } from './types.js';

export interface PartiesService {
  list(shopId: string, options?: { type?: PartyType }): Promise<PartyDto[]>;
  get(shopId: string, partyId: string): Promise<PartyDto>;
  create(actor: PartyActor, input: PartyInput): Promise<PartyDto>;
  update(actor: PartyActor, partyId: string, patch: PartyUpdate): Promise<PartyDto>;
  archive(actor: PartyActor, partyId: string): Promise<void>;
}

function optional(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function snapshot(record: PartyRecord): Record<string, unknown> {
  return {
    type: record.type,
    name: record.name,
    phone: record.phone,
    address: record.address,
    notes: record.notes,
  };
}

export function createPartiesService(store: PartyStore): PartiesService {
  async function requireParty(shopId: string, partyId: string): Promise<PartyRecord> {
    const record = await store.find(shopId, partyId);

    if (!record) {
      throw new PartyError('party-not-found', 'That party is not in this shop');
    }

    return record;
  }

  return {
    async list(shopId, options) {
      const records = await store.list(shopId, options ?? {});
      return records.map(toPartyDto);
    },

    async get(shopId, partyId) {
      return toPartyDto(await requireParty(shopId, partyId));
    },

    async create(actor, input) {
      const record = await store.create(actor.shopId, {
        ...input,
        name: input.name.trim(),
        phone: optional(input.phone),
        address: optional(input.address),
        notes: optional(input.notes),
      });

      await store.recordAudit({
        shopId: actor.shopId,
        ownerId: actor.ownerId,
        source: actor.source,
        operation: 'parties.create',
        entityId: record.id,
        after: snapshot(record),
      });

      return toPartyDto(record);
    },

    async update(actor, partyId, patch) {
      const before = await requireParty(actor.shopId, partyId);
      const beforeState = snapshot(before);

      const record = await store.update(actor.shopId, partyId, {
        ...patch,
        ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
        ...(patch.phone === undefined ? {} : { phone: optional(patch.phone) }),
        ...(patch.address === undefined ? {} : { address: optional(patch.address) }),
        ...(patch.notes === undefined ? {} : { notes: optional(patch.notes) }),
      });

      await store.recordAudit({
        shopId: actor.shopId,
        ownerId: actor.ownerId,
        source: actor.source,
        operation: 'parties.update',
        entityId: record.id,
        before: beforeState,
        after: snapshot(record),
      });

      return toPartyDto(record);
    },

    async archive(actor, partyId) {
      const before = await requireParty(actor.shopId, partyId);

      if (before.archivedAt !== null) {
        return;
      }

      await store.archive(actor.shopId, partyId, new Date());

      await store.recordAudit({
        shopId: actor.shopId,
        ownerId: actor.ownerId,
        source: actor.source,
        operation: 'parties.archive',
        entityId: partyId,
        before: snapshot(before),
      });
    },
  };
}
