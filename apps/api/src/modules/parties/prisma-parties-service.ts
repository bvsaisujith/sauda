import { createPartiesService } from './parties-service.js';
import { createPrismaPartyStore } from './prisma-party-store.js';

export const partiesService = createPartiesService(createPrismaPartyStore());
