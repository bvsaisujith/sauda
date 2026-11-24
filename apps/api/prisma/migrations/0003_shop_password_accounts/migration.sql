-- Shop accounts: shops sign in with a name and a password.
-- loginKey is the trimmed, lowercased shop name so login is case-insensitive
-- while the owner still sees the name exactly as they typed it.
ALTER TABLE "Shop" ADD COLUMN "loginKey" TEXT;

UPDATE "Shop" SET "loginKey" = lower(btrim("name"));

ALTER TABLE "Shop" ALTER COLUMN "loginKey" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Shop_loginKey_key" ON "Shop"("loginKey");

-- AlterTable
ALTER TABLE "Owner" RENAME COLUMN "pinHash" TO "passwordHash";