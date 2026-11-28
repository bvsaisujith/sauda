import { z } from 'zod';
import { paiseSchema, quantitySchema } from './items.js';
import { partyTypeSchema } from './parties.js';

export const orderStatusSchema = z.enum(['pending', 'fulfilled', 'cancelled']);

export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const orderLineInputSchema = z.object({
  itemId: z.string().min(1, 'Choose an item'),
  quantity: quantitySchema,
  ratePaise: paiseSchema,
});

export const orderInputSchema = z.object({
  type: partyTypeSchema,
  partyId: z.string().min(1, 'Choose a party'),
  orderDate: z.iso.date(),
  notes: z.string().trim().max(500).nullable().default(null),
  lines: z.array(orderLineInputSchema).min(1, 'Add at least one line'),
  /** Save and mark fulfilled in one step; fulfilment generates the bill. */
  fulfil: z.boolean().default(false),
});

export const orderUpdateSchema = z
  .object({
    partyId: z.string().min(1).optional(),
    orderDate: z.iso.date().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    lines: z.array(orderLineInputSchema).min(1).optional(),
    version: z.number().int().positive(),
  })
  .refine(
    (value) =>
      value.partyId !== undefined ||
      value.orderDate !== undefined ||
      value.notes !== undefined ||
      value.lines !== undefined,
    'Nothing to update',
  );

export const orderLineSchema = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
  quantity: z.number(),
  ratePaise: z.number().int(),
  lineTotalPaise: z.number().int(),
});

export const orderSchema = z.object({
  id: z.string().min(1),
  type: partyTypeSchema,
  partyId: z.string().min(1),
  orderDate: z.iso.date(),
  status: orderStatusSchema,
  totalPaise: z.number().int(),
  notes: z.string().nullable(),
  version: z.number().int(),
  billId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  lines: z.array(orderLineSchema),
});

/** The route adds the party name so the order module never reads parties. */
export const orderWithPartySchema = orderSchema.extend({
  partyName: z.string(),
  itemNames: z.record(z.string(), z.string()).optional(),
});

export const orderListSchema = z.object({
  orders: z.array(orderWithPartySchema),
});

export type OrderLineInput = z.infer<typeof orderLineInputSchema>;
export type OrderInput = z.infer<typeof orderInputSchema>;
export type OrderUpdate = z.infer<typeof orderUpdateSchema>;
export type OrderLineDto = z.infer<typeof orderLineSchema>;
export type OrderDto = z.infer<typeof orderSchema>;
export type OrderWithPartyDto = z.infer<typeof orderWithPartySchema>;
