import type { ItemInput, ItemUpdate, Unit } from '@sauda/shared';
import { db } from '../../db.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ItemError } from './item-errors.js';
import type { AuditWrite, ItemRecord, ItemStore } from './types.js';

interface ItemRow {
  id: string;
  name: string;
  baseUnit: string;
  sellPrice: { toString(): string };
  buyPrice: { toString(): string };
  reorderLevel: { toString(): string };
  gstRate: number;
  hsnCode: string | null;
  archivedAt: Date | null;
}

function toRecord(row: ItemRow): ItemRecord {
  return {
    id: row.id,
    name: row.name,
    baseUnit: row.baseUnit as Unit,
    sellPricePaise: Number(row.sellPrice),
    buyPricePaise: Number(row.buyPrice),
    reorderLevel: Number(row.reorderLevel),
    gstRate: row.gstRate,
    hsnCode: row.hsnCode,
    archivedAt: row.archivedAt,
  };
}

const SELECT = {
  id: true,
  name: true,
  baseUnit: true,
  sellPrice: true,
  buyPrice: true,
  reorderLevel: true,
  gstRate: true,
  hsnCode: true,
  archivedAt: true,
} as const;

function createData(shopId: string, input: ItemInput): Prisma.ItemUncheckedCreateInput {
  return {
    shopId,
    name: input.name,
    baseUnit: input.baseUnit,
    sellPrice: input.sellPricePaise,
    buyPrice: input.buyPricePaise,
    reorderLevel: input.reorderLevel,
    gstRate: input.gstRate,
    hsnCode: input.hsnCode,
  };
}

function updateData(patch: ItemUpdate): Prisma.ItemUncheckedUpdateInput {
  return {
    ...(patch.name === undefined ? {} : { name: patch.name }),
    ...(patch.baseUnit === undefined ? {} : { baseUnit: patch.baseUnit }),
    ...(patch.sellPricePaise === undefined ? {} : { sellPrice: patch.sellPricePaise }),
    ...(patch.buyPricePaise === undefined ? {} : { buyPrice: patch.buyPricePaise }),
    ...(patch.reorderLevel === undefined ? {} : { reorderLevel: patch.reorderLevel }),
    ...(patch.gstRate === undefined ? {} : { gstRate: patch.gstRate }),
    ...(patch.hsnCode === undefined ? {} : { hsnCode: patch.hsnCode }),
  };
}

export function createPrismaItemStore(): ItemStore {
  return {
    async list(shopId, { includeArchived }) {
      const rows = await db().item.findMany({
        where: { shopId, ...(includeArchived ? {} : { archivedAt: null }) },
        select: SELECT,
        orderBy: { name: 'asc' },
      });

      return rows.map(toRecord);
    },

    async find(shopId, itemId) {
      const row = await db().item.findFirst({ where: { id: itemId, shopId }, select: SELECT });
      return row ? toRecord(row) : null;
    },

    async create(shopId, input) {
      try {
        const row = await db().item.create({
          data: createData(shopId, input),
          select: SELECT,
        });
        return toRecord(row);
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') {
          throw new ItemError(
            'item-exists',
            `An item called "${input.name}" already exists in this shop`,
          );
        }
        throw error;
      }
    },

    async update(shopId, itemId, patch) {
      const existing = await db().item.findFirst({ where: { id: itemId, shopId }, select: { id: true } });

      if (!existing) {
        throw new ItemError('item-not-found', 'That item is not in this shop');
      }

      try {
        const row = await db().item.update({
          where: { id: itemId },
          data: updateData(patch),
          select: SELECT,
        });
        return toRecord(row);
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') {
          throw new ItemError('item-exists', 'Another item already has that name');
        }
        throw error;
      }
    },

    async archive(shopId, itemId, at) {
      await db().item.updateMany({
        where: { id: itemId, shopId, archivedAt: null },
        data: { archivedAt: at },
      });
    },

    async recordAudit(entry: AuditWrite) {
      await db().auditEntry.create({
        data: {
          shopId: entry.shopId,
          ownerId: entry.ownerId,
          source: entry.source,
          operation: entry.operation,
          entityType: entry.entityType,
          entityId: entry.entityId,
          ...(entry.before === undefined ? {} : { before: entry.before as Prisma.InputJsonValue }),
          ...(entry.after === undefined ? {} : { after: entry.after as Prisma.InputJsonValue }),
        },
      });
    },
  };
}
