import type { StockMovementType } from '@sauda/shared';
import { db } from '../../db.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { InsufficientStockError } from './stock-errors.js';
import type { AdjustInput, ReceiveInput, StockAuditWrite, StockMovementRecord, StockStore } from './types.js';

interface MovementRow {
  id: string;
  itemId: string;
  type: string;
  quantity: { toString(): string };
  unitCost: { toString(): string } | null;
  note: string | null;
  createdAt: Date;
}

function toRecord(row: MovementRow): StockMovementRecord {
  return {
    id: row.id,
    itemId: row.itemId,
    type: row.type as StockMovementType,
    quantity: Number(row.quantity),
    unitCostPaise: row.unitCost === null ? null : Number(row.unitCost),
    note: row.note,
    createdAt: row.createdAt,
  };
}

const MOVEMENT_SELECT = {
  id: true,
  itemId: true,
  type: true,
  quantity: true,
  unitCost: true,
  note: true,
  createdAt: true,
} as const;

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function createPrismaStockStore(): StockStore {
  return {
    async receive(input: ReceiveInput) {
      return db().$transaction(async (tx) => {
        const batch = await tx.stockBatch.create({
          data: {
            itemId: input.itemId,
            quantity: input.quantity,
            remaining: input.quantity,
            unitCost: input.unitCostPaise,
            ...(input.expiryDate === null ? {} : { expiryDate: input.expiryDate }),
          },
        });

        const movement = await tx.stockMovement.create({
          data: {
            itemId: input.itemId,
            batchId: batch.id,
            type: 'RECEIPT',
            quantity: input.quantity,
            unitCost: input.unitCostPaise,
            referenceType: 'manual',
            note: input.note,
          },
          select: MOVEMENT_SELECT,
        });

        return toRecord(movement);
      });
    },

    async adjust(input: AdjustInput) {
      return db().$transaction(async (tx) => {
        if (input.delta > 0) {
          const batch = await tx.stockBatch.create({
            data: {
              itemId: input.itemId,
              quantity: input.delta,
              remaining: input.delta,
              unitCost: input.fallbackUnitCostPaise,
            },
          });

          const movement = await tx.stockMovement.create({
            data: {
              itemId: input.itemId,
              batchId: batch.id,
              type: 'ADJUSTMENT',
              quantity: input.delta,
              unitCost: input.fallbackUnitCostPaise,
              referenceType: input.referenceType ?? 'manual',
              referenceId: input.referenceId ?? null,
              note: input.reason,
            },
            select: MOVEMENT_SELECT,
          });

          return toRecord(movement);
        }

        // A reduction consumes the oldest batches first, mirroring FIFO cost.
        const batches = await tx.stockBatch.findMany({
          where: { itemId: input.itemId, remaining: { gt: 0 } },
          orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
          select: { id: true, remaining: true },
        });

        const available = roundQuantity(
          batches.reduce((total, batch) => total + Number(batch.remaining), 0),
        );
        const wanted = roundQuantity(-input.delta);

        if (available < wanted) {
          throw new InsufficientStockError(available);
        }

        let left = wanted;

        for (const batch of batches) {
          if (left <= 0) {
            break;
          }

          const take = Math.min(roundQuantity(Number(batch.remaining)), left);

          await tx.stockBatch.update({
            where: { id: batch.id },
            data: { remaining: { decrement: take } },
          });

          left = roundQuantity(left - take);
        }

        const movement = await tx.stockMovement.create({
          data: {
            itemId: input.itemId,
            type: 'ADJUSTMENT',
            quantity: input.delta,
            referenceType: input.referenceType ?? 'manual',
            referenceId: input.referenceId ?? null,
            note: input.reason,
          },
          select: MOVEMENT_SELECT,
        });

        return toRecord(movement);
      });
    },

    async onHand(shopId, itemId) {
      // On-hand is summed from the append-only movements, never read from a
      // stored balance. Batch remainders exist only to drive FIFO consumption.
      const total = await db().stockMovement.aggregate({
        where: { itemId, item: { shopId } },
        _sum: { quantity: true },
      });

      return roundQuantity(Number(total._sum.quantity ?? 0));
    },

    async onHandByShop(shopId) {
      const rows = await db().stockMovement.groupBy({
        by: ['itemId'],
        where: { item: { shopId } },
        _sum: { quantity: true },
      });

      const summary = new Map<string, number>();

      for (const row of rows) {
        summary.set(row.itemId, roundQuantity(Number(row._sum.quantity ?? 0)));
      }

      return summary;
    },

    async listMovements(shopId, itemId, limit) {
      const rows = await db().stockMovement.findMany({
        where: { itemId, item: { shopId } },
        select: MOVEMENT_SELECT,
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return rows.map(toRecord);
    },

    async recordAudit(entry: StockAuditWrite) {
      await db().auditEntry.create({
        data: {
          shopId: entry.shopId,
          ownerId: entry.ownerId,
          source: entry.source,
          operation: entry.operation,
          entityType: 'StockMovement',
          entityId: entry.entityId,
          ...(entry.before === undefined ? {} : { before: entry.before as Prisma.InputJsonValue }),
          ...(entry.after === undefined ? {} : { after: entry.after as Prisma.InputJsonValue }),
        },
      });
    },
  };
}
