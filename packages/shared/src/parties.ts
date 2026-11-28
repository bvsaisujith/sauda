import { z } from 'zod';

/** A party is either someone who buys from the shop or someone who supplies it. */
export const partyTypeSchema = z.enum(['customer', 'supplier']);

export type PartyType = z.infer<typeof partyTypeSchema>;

export const PARTY_TYPE_LABELS: Record<PartyType, string> = {
  customer: 'Customer',
  supplier: 'Supplier',
};

const phoneSchema = z
  .string()
  .trim()
  .min(6, 'Enter a phone number')
  .max(20)
  .regex(/^[0-9+\-() ]+$/, 'Use digits, spaces, +, - or brackets');

export const partyInputSchema = z.object({
  type: partyTypeSchema,
  name: z.string().trim().min(1, 'Enter a name').max(120),
  phone: phoneSchema.nullable().default(null),
  address: z.string().trim().max(240).nullable().default(null),
  notes: z.string().trim().max(500).nullable().default(null),
});

export const partyUpdateSchema = z
  .object({
    type: partyTypeSchema.optional(),
    name: z.string().trim().min(1, 'Enter a name').max(120).optional(),
    phone: phoneSchema.nullable().optional(),
    address: z.string().trim().max(240).nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');

export const partySchema = z.object({
  id: z.string().min(1),
  type: partyTypeSchema,
  name: z.string().min(1),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
  archivedAt: z.iso.datetime().nullable(),
});

/**
 * Balances are derived from bills, never stored on the party. Receivable is
 * money customers owe; payable is money the shop owes suppliers.
 */
export const partyWithBalanceSchema = partySchema.extend({
  receivablePaise: z.number().int(),
  payablePaise: z.number().int(),
});

export const partyListSchema = z.object({
  parties: z.array(partyWithBalanceSchema),
});

export type PartyInput = z.infer<typeof partyInputSchema>;
export type PartyUpdate = z.infer<typeof partyUpdateSchema>;
export type PartyDto = z.infer<typeof partySchema>;
export type PartyWithBalanceDto = z.infer<typeof partyWithBalanceSchema>;
