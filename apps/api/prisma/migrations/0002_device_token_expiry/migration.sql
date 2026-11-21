-- DropIndex
DROP INDEX "Owner_shopId_idx";

-- AlterTable
ALTER TABLE "DeviceToken" ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Owner_shopId_key" ON "Owner"("shopId");

-- CreateIndex
CREATE INDEX "DeviceToken_expiresAt_idx" ON "DeviceToken"("expiresAt");
