import { z } from 'zod';
import { paiseSchema } from './items.js';
import { orderStatusSchema, orderWithPartySchema } from './orders.js';
import { partyTypeSchema } from './parties.js';

/**
 * A bill is never "closed by hand". Its status and closed flag are always
 * recomputed from the order total and the payments recorded against it.
 */
export const billStatusSchema = z.enum(['unpaid', 'partial', 'paid']);

export type BillStatus = z.infer<typeof billStatusSchema>;

export const BILL_STATUS_LABELS: Record<BillStatus, string> = {
  unpaid: 'Unpaid',
  partial: 'Partially paid',
  paid: 'Paid',
};

/** The one function every caller uses to derive a bill's status. */
export function billStatus(totalPaise: number, paidPaise: number): BillStatus {
  if (paidPaise <= 0) {
    return 'unpaid';
  }

  if (paidPaise < totalPaise) {
    return 'partial';
  }

  return 'paid';
}

export const paymentModeSchema = z.enum(['cash', 'upi', 'bank']);

export type PaymentMode = z.infer<typeof paymentModeSchema>;

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank: 'Bank',
};

export const billPaymentInputSchema = z.object({
  amountPaise: paiseSchema.refine((value) => value > 0, 'Enter an amount greater than zero'),
  paidOn: z.iso.date(),
  mode: paymentModeSchema.default('cash'),
  note: z.string().trim().max(200).nullable().default(null),
});

export const billPaymentUpdateSchema = z
  .object({
    amountPaise: paiseSchema.refine((value) => value > 0, 'Enter an amount greater than zero').optional(),
    paidOn: z.iso.date().optional(),
    mode: paymentModeSchema.optional(),
    note: z.string().trim().max(200).nullable().optional(),
    version: z.number().int().positive(),
  })
  .refine(
    (value) =>
      value.amountPaise !== undefined ||
      value.paidOn !== undefined ||
      value.mode !== undefined ||
      value.note !== undefined,
    'Nothing to update',
  );

export const billPaymentSchema = z.object({
  id: z.string().min(1),
  billId: z.string().min(1),
  amountPaise: z.number().int(),
  paidOn: z.iso.date(),
  mode: paymentModeSchema,
  note: z.string().nullable(),
  version: z.number().int(),
  createdAt: z.iso.datetime(),
});

export const billSchema = z.object({
  id: z.string().min(1),
  orderId: z.string().min(1),
  billNumber: z.string().min(1),
  partyId: z.string().min(1),
  orderType: partyTypeSchema,
  totalPaise: z.number().int(),
  paidPaise: z.number().int(),
  balancePaise: z.number().int(),
  status: billStatusSchema,
  closed: z.boolean(),
  version: z.number().int(),
  createdAt: z.iso.datetime(),
});

export const billWithPaymentsSchema = billSchema.extend({
  payments: z.array(billPaymentSchema),
});

/** The route composes the party name and the order lines onto the bill. */
export const billDetailSchema = billWithPaymentsSchema.extend({
  partyName: z.string(),
  order: orderWithPartySchema,
});

export const billListSchema = z.object({
  bills: z.array(billSchema.extend({ partyName: z.string() })),
});

export const billDetailEnvelopeSchema = z.object({ bill: billDetailSchema });

export const billWriteResultSchema = z.object({
  bill: billWithPaymentsSchema.extend({ partyName: z.string() }),
});

export const reopenRequestSchema = z.object({
  version: z.number().int().positive().optional(),
});

export const dashboardSummarySchema = z.object({
  todaySalesPaise: z.number().int(),
  todayPurchasesPaise: z.number().int(),
  receivablePaise: z.number().int(),
  payablePaise: z.number().int(),
  billCounts: z.object({
    unpaid: z.number().int(),
    partial: z.number().int(),
    paid: z.number().int(),
  }),
});

export const orderFulfilResultSchema = z.object({
  bill: billWithPaymentsSchema,
  orderStatus: orderStatusSchema,
});

export type BillPaymentInput = z.infer<typeof billPaymentInputSchema>;
export type BillPaymentUpdate = z.infer<typeof billPaymentUpdateSchema>;
export type BillPaymentDto = z.infer<typeof billPaymentSchema>;
export type BillDto = z.infer<typeof billSchema>;
export type BillWithPaymentsDto = z.infer<typeof billWithPaymentsSchema>;
export type BillDetailDto = z.infer<typeof billDetailSchema>;
export type DashboardSummaryDto = z.infer<typeof dashboardSummarySchema>;
