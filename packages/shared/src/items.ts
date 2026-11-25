import { z } from 'zod';

/**
 * Units the shop actually counts in. A kirana sells loose rice by the kg,
 * oil by the litre and soap by the piece, so the list stays short and real.
 */
export const unitSchema = z.enum(['piece', 'kg', 'g', 'litre', 'ml', 'packet', 'dozen', 'box']);

export type Unit = z.infer<typeof unitSchema>;

export const UNIT_LABELS: Record<Unit, string> = {
  piece: 'piece',
  kg: 'kg',
  g: 'g',
  litre: 'litre',
  ml: 'ml',
  packet: 'packet',
  dozen: 'dozen',
  box: 'box',
};

/** Money crosses the wire in whole paise so no rounding happens in JSON. */
export const paiseSchema = z.number().int().min(0).max(99_999_999_999);

export const quantitySchema = z.number().positive().max(1_000_000);

export const itemInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter an item name').max(120),
  baseUnit: unitSchema,
  sellPricePaise: paiseSchema,
  buyPricePaise: paiseSchema,
  reorderLevel: z.number().min(0).max(1_000_000).default(0),
  gstRate: z.number().int().min(0).max(28).default(0),
  hsnCode: z.string().trim().max(20).nullable().default(null),
});

export const itemUpdateSchema = itemInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');

export const itemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  baseUnit: unitSchema,
  sellPricePaise: paiseSchema,
  buyPricePaise: paiseSchema,
  reorderLevel: z.number(),
  gstRate: z.number().int(),
  hsnCode: z.string().nullable(),
  archivedAt: z.iso.datetime().nullable(),
});

export const itemWithStockSchema = itemSchema.extend({
  stockOnHand: z.number(),
});

export const itemListSchema = z.object({
  items: z.array(itemWithStockSchema),
});

export type ItemInput = z.infer<typeof itemInputSchema>;
export type ItemUpdate = z.infer<typeof itemUpdateSchema>;
export type ItemDto = z.infer<typeof itemSchema>;
export type ItemWithStockDto = z.infer<typeof itemWithStockSchema>;
