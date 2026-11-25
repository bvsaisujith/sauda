import { createItemsService } from './items-service.js';
import { createPrismaItemStore } from './prisma-item-store.js';

export const itemsService = createItemsService(createPrismaItemStore());
