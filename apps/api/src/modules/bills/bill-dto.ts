import type { BillDto, BillPaymentDto } from '@sauda/shared';
import type { BillPaymentRecord, BillRecord } from './types.js';

export function toBillDto(record: BillRecord): BillDto {
  return {
    id: record.id,
    orderId: record.orderId,
    billNumber: record.billNumber,
    partyId: record.partyId,
    orderType: record.orderType,
    totalPaise: record.totalPaise,
    paidPaise: record.paidPaise,
    balancePaise: record.totalPaise - record.paidPaise,
    status: record.status,
    closed: record.closed,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toPaymentDto(record: BillPaymentRecord): BillPaymentDto {
  return {
    id: record.id,
    billId: record.billId,
    amountPaise: record.amountPaise,
    paidOn: record.paidOn.toISOString().slice(0, 10),
    mode: record.mode,
    note: record.note,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
  };
}
