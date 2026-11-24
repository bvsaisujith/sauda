import type { Prisma } from '../../generated/prisma/client.js';
import { db } from '../../db.js';
import { ShopExistsError } from './shop-exists-error.js';
import type { AuditRecord, AuthStore, LoginOwner, TokenRecord } from './types.js';

export function createPrismaAuthStore(): AuthStore {
  return {
    async createShopWithOwner(input): Promise<{ shopId: string; ownerId: string }> {
      try {
        return await db().$transaction(async (tx) => {
          const shop = await tx.shop.create({
            data: { name: input.shopName, loginKey: input.loginKey },
          });
          const owner = await tx.owner.create({
            data: { shopId: shop.id, passwordHash: input.passwordHash },
          });
          return { shopId: shop.id, ownerId: owner.id };
        });
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') {
          throw new ShopExistsError();
        }
        throw error;
      }
    },

    async findOwnerForLogin(loginKey: string): Promise<LoginOwner | null> {
      const owner = await db().owner.findFirst({
        where: { shop: { loginKey } },
        include: { shop: { select: { id: true, name: true } } },
      });

      if (!owner) {
        return null;
      }

      return {
        ownerId: owner.id,
        shopId: owner.shopId,
        shopName: owner.shop.name,
        passwordHash: owner.passwordHash,
      };
    },

    async insertToken(input): Promise<void> {
      await db().deviceToken.create({
        data: {
          ownerId: input.ownerId,
          tokenHash: input.tokenHash,
          label: input.label,
          expiresAt: input.expiresAt,
        },
      });
    },

    async findToken(tokenHash: string): Promise<TokenRecord | null> {
      const token = await db().deviceToken.findUnique({
        where: { tokenHash },
        include: { owner: { include: { shop: { select: { id: true, name: true } } } } },
      });

      if (!token) {
        return null;
      }

      return {
        id: token.id,
        ownerId: token.ownerId,
        shopId: token.owner.shopId,
        shopName: token.owner.shop.name,
        expiresAt: token.expiresAt,
        revokedAt: token.revokedAt,
      };
    },

    async touchToken(tokenId: string, at: Date): Promise<void> {
      await db().deviceToken.update({ where: { id: tokenId }, data: { lastUsedAt: at } });
    },

    async revokeToken(tokenId: string, at: Date): Promise<void> {
      await db().deviceToken.updateMany({
        where: { id: tokenId, revokedAt: null },
        data: { revokedAt: at },
      });
    },

    async recordAudit(record: AuditRecord): Promise<void> {
      await db().auditEntry.create({
        data: {
          shopId: record.shopId,
          ownerId: record.ownerId,
          source: 'SYSTEM',
          operation: record.operation,
          entityType: 'Owner',
          entityId: record.entityId,
          ...(record.after === undefined
            ? {}
            : { after: record.after as Prisma.InputJsonValue }),
        },
      });
    },
  };
}