import { z } from 'zod';
import { paiseSchema, quantitySchema } from './items.js';

export const stockMovementTypeSchema = z.enum([
  'RECEIPT',
  'SALE',
  'ADJUSTMENT',
  'REPACK_CONSUME',
  'REPACK_PRODUCE',
  'REVERSAL',
]);

export const stockReceiveRequestSchema = z.object({
  itemId: z.string().min(1),
  quantity: quantitySchema,
  unitCostPaise: paiseSchema.optional(),
  expiryDate: z.iso.date().optional(),
  note: z.string().trim().max(200).optional(),
});

export const stockAdjustRequestSchema = z.object({
  itemId: z.string().min(1),
  delta: z
    .number()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((value) => value !== 0, 'Enter a quantity to add or remove'),
  reason: z.string().trim().min(1, 'Say why the stock changed').max(200),
});

export const stockMovementSchema = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
  type: stockMovementTypeSchema,
  /** Signed: a receipt is positive, a reduction is negative. */
  quantity: z.number(),
  unitCostPaise: z.number().int().nullable(),
  note: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const stockSummarySchema = z.object({
  itemId: z.string().min(1),
  onHand: z.number(),
});

export const stockSummaryListSchema = z.object({
  summary: z.array(stockSummarySchema),
});

export const stockMovementListSchema = z.object({
  movements: z.array(stockMovementSchema),
});

export const stockWriteResultSchema = z.object({
  movement: stockMovementSchema,
  onHand: z.number(),
});

export type StockReceiveRequest = z.infer<typeof stockReceiveRequestSchema>;
export type StockAdjustRequest = z.infer<typeof stockAdjustRequestSchema>;
export type StockMovementType = z.infer<typeof stockMovementTypeSchema>;
export type StockMovementDto = z.infer<typeof stockMovementSchema>;
export type StockSummaryDto = z.infer<typeof stockSummarySchema>;
export type StockWriteResult = z.infer<typeof stockWriteResultSchema>;
