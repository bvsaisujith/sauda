import type { PartyInput, PartyType, PartyUpdate } from '@sauda/shared';
import { db } from '../../db.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PartyError } from './party-errors.js';
import type { PartyAuditWrite, PartyRecord, PartyStore } from './types.js';

interface PartyRow {
  id: string;
  name: string;
  phone: string | null;
  area: string | null;
  notes: string | null;
  isCustomer: boolean;
  archivedAt: Date | null;
}

function toRecord(row: PartyRow): PartyRecord {
  return {
    id: row.id,
    type: row.isCustomer ? 'customer' : 'supplier',
    name: row.name,
    phone: row.phone,
    address: row.area,
    notes: row.notes,
    archivedAt: row.archivedAt,
  };
}

const SELECT = {
  id: true,
  name: true,
  phone: true,
  area: true,
  notes: true,
  isCustomer: true,
  archivedAt: true,
} as const;

function typeFilter(type: PartyType): Prisma.PartyWhereInput {
  return type === 'customer' ? { isCustomer: true } : { isSupplier: true };
}

export function createPrismaPartyStore(): PartyStore {
  async function assertNameFree(shopId: string, name: string, exceptId?: string): Promise<void> {
    const clash = await db().party.findFirst({
      where: {
        shopId,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId === undefined ? {} : { id: { not: exceptId } }),
      },
      select: { id: true },
    });

    if (clash) {
      throw new PartyError('party-exists', `A party called "${name}" already exists in this shop`);
    }
  }

  return {
    async list(shopId, { type }) {
      const rows = await db().party.findMany({
        where: {
          shopId,
          archivedAt: null,
          ...(type === undefined ? {} : typeFilter(type)),
        },
        select: SELECT,
        orderBy: { name: 'asc' },
      });

      return rows.map(toRecord);
    },

    async find(shopId, partyId) {
      const row = await db().party.findFirst({ where: { id: partyId, shopId }, select: SELECT });
      return row ? toRecord(row) : null;
    },

    async create(shopId, input: PartyInput) {
      await assertNameFree(shopId, input.name);

      try {
        const row = await db().party.create({
          data: {
            shopId,
            name: input.name,
            phone: input.phone,
            area: input.address,
            notes: input.notes,
            isCustomer: input.type === 'customer',
            isSupplier: input.type === 'supplier',
          },
          select: SELECT,
        });

        return toRecord(row);
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') {
          throw new PartyError('party-exists', `A party called "${input.name}" already exists`);
        }
        throw error;
      }
    },

    async update(shopId, partyId, patch: PartyUpdate) {
      const existing = await db().party.findFirst({
        where: { id: partyId, shopId },
        select: { id: true },
      });

      if (!existing) {
        throw new PartyError('party-not-found', 'That party is not in this shop');
      }

      if (patch.name !== undefined) {
        await assertNameFree(shopId, patch.name, partyId);
      }

      const data: Prisma.PartyUncheckedUpdateInput = {
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.phone === undefined ? {} : { phone: patch.phone }),
        ...(patch.address === undefined ? {} : { area: patch.address }),
        ...(patch.notes === undefined ? {} : { notes: patch.notes }),
        ...(patch.type === undefined
          ? {}
          : { isCustomer: patch.type === 'customer', isSupplier: patch.type === 'supplier' }),
      };

      try {
        const row = await db().party.update({ where: { id: partyId }, data, select: SELECT });
        return toRecord(row);
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') {
          throw new PartyError('party-exists', 'Another party already has that name');
        }
        throw error;
      }
    },

    async archive(shopId, partyId, at) {
      await db().party.updateMany({
        where: { id: partyId, shopId, archivedAt: null },
        data: { archivedAt: at },
      });
    },

    async recordAudit(entry: PartyAuditWrite) {
      await db().auditEntry.create({
        data: {
          shopId: entry.shopId,
          ownerId: entry.ownerId,
          source: entry.source,
          operation: entry.operation,
          entityType: 'Party',
          entityId: entry.entityId,
          ...(entry.before === undefined ? {} : { before: entry.before as Prisma.InputJsonValue }),
          ...(entry.after === undefined ? {} : { after: entry.after as Prisma.InputJsonValue }),
        },
      });
    },
  };
}
