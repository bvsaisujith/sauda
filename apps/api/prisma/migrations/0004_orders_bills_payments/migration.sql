-- Orders, bills and bill payments: the order -> fulfil -> bill -> payment flow.
-- Bill status and the closed flag are derived, never set by hand.

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('CUSTOMER', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillPaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID');

-- AlterTable
ALTER TABLE "Party" ADD COLUMN "notes" TEXT;

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "type" "OrderType" NOT NULL,
    "partyId" TEXT NOT NULL,
    "orderDate" DATE NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "totalPaise" DECIMAL(14,0) NOT NULL,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "ratePaise" DECIMAL(14,0) NOT NULL,
    "lineTotalPaise" DECIMAL(14,0) NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "billNumber" TEXT NOT NULL,
    "totalPaise" DECIMAL(14,0) NOT NULL,
    "paidPaise" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "status" "BillPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillPayment" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "amountPaise" DECIMAL(14,0) NOT NULL,
    "paidOn" DATE NOT NULL,
    "mode" "PaymentMode" NOT NULL DEFAULT 'CASH',
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BillPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_shopId_type_status_idx" ON "Order"("shopId", "type", "status");

-- CreateIndex
CREATE INDEX "Order_shopId_orderDate_idx" ON "Order"("shopId", "orderDate");

-- CreateIndex
CREATE INDEX "Order_partyId_idx" ON "Order"("partyId");

-- CreateIndex
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");

-- CreateIndex
CREATE INDEX "OrderLine_itemId_idx" ON "OrderLine"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_orderId_key" ON "Bill"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_shopId_billNumber_key" ON "Bill"("shopId", "billNumber");

-- CreateIndex
CREATE INDEX "Bill_shopId_status_createdAt_idx" ON "Bill"("shopId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Bill_shopId_partyId_idx" ON "Bill"("shopId", "partyId");

-- CreateIndex
CREATE INDEX "BillPayment_billId_paidOn_idx" ON "BillPayment"("billId", "paidOn");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillPayment" ADD CONSTRAINT "BillPayment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
