import type { OrderDto, OrderLineDto } from '@sauda/shared';
import type { OrderLineRecord, OrderRecord, OrderWithLines } from './types.js';

function toLineDto(record: OrderLineRecord): OrderLineDto {
  return {
    id: record.id,
    itemId: record.itemId,
    quantity: record.quantity,
    ratePaise: record.ratePaise,
    lineTotalPaise: record.lineTotalPaise,
  };
}

export function toOrderDto(record: OrderWithLines): OrderDto {
  return {
    id: record.order.id,
    type: record.order.type,
    partyId: record.order.partyId,
    orderDate: record.order.orderDate.toISOString().slice(0, 10),
    status: record.order.status,
    totalPaise: record.order.totalPaise,
    notes: record.order.notes,
    version: record.order.version,
    billId: record.order.billId,
    createdAt: record.order.createdAt.toISOString(),
    lines: record.lines.map(toLineDto),
  };
}

export type { OrderRecord };
