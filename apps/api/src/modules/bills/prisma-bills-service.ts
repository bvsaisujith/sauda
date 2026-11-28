import { createBillsService } from './bills-service.js';
import { createPrismaBillStore } from './prisma-bill-store.js';

export const billsService = createBillsService(createPrismaBillStore());
