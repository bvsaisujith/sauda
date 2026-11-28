import { billsService } from '../bills/public.js';
import { stockService } from '../stock/public.js';
import { createOrdersService } from './orders-service.js';
import { createPrismaOrderStore } from './prisma-order-store.js';

export const ordersService = createOrdersService(
  createPrismaOrderStore(),
  stockService,
  billsService,
);
