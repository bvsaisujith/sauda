import { createStockService } from './stock-service.js';
import { createPrismaStockStore } from './prisma-stock-store.js';
import { itemsService } from '../items/public.js';

export const stockService = createStockService(createPrismaStockStore(), itemsService);
