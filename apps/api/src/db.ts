import { PrismaPg } from '@prisma/adapter-pg';
import { env } from './config.js';
import { PrismaClient } from './generated/prisma/client.js';

let client: PrismaClient | undefined;

/**
 * Prisma is created on first use so that importing a module never requires a
 * live database. Owners of the process call closeDb() on shutdown.
 */
export function db(): PrismaClient {
  if (!client) {
    client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
    });
  }

  return client;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}
