-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Source" AS ENUM ('TOUCH', 'VOICE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIPT', 'SALE', 'ADJUSTMENT', 'REPACK_CONSUME', 'REPACK_PRODUCE', 'REVERSAL');

-- CreateEnum
CREATE TYPE "RepackStatus" AS ENUM ('ACTIVE', 'REVERSED');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('BILL', 'PAYMENT', 'ADVANCE', 'REVERSAL');

-- CreateEnum
CREATE TYPE "PaymentDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'UPI', 'BANK');

-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('SAVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'ORDERED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'COMMITTED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deadStockDays" INTEGER NOT NULL DEFAULT 60,
    "festivalLeadDays" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Owner" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUnit" TEXT NOT NULL,
    "sellPrice" DECIMAL(14,0) NOT NULL,
    "buyPrice" DECIMAL(14,0) NOT NULL,
    "priceIncludesGst" BOOLEAN NOT NULL DEFAULT true,
    "gstRate" INTEGER NOT NULL DEFAULT 0,
    "hsnCode" TEXT,
    "reorderLevel" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "packOfItemId" TEXT,
    "packQuantity" DECIMAL(12,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBatch" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quantity" DECIMAL(12,3) NOT NULL,
    "remaining" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(14,0) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "repackId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "batchId" TEXT,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(14,0),
    "referenceType" TEXT,
    "referenceId" TEXT,
    "note" TEXT,
    "source" "Source" NOT NULL DEFAULT 'TOUCH',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repack" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "baseItemId" TEXT NOT NULL,
    "packItemId" TEXT NOT NULL,
    "consumedQty" DECIMAL(12,3) NOT NULL,
    "producedQty" DECIMAL(12,3) NOT NULL,
    "wastageQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "wastageReason" TEXT,
    "consumedCost" DECIMAL(14,0) NOT NULL,
    "producedCost" DECIMAL(14,0) NOT NULL,
    "producedBatchId" TEXT,
    "status" "RepackStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),

    CONSTRAINT "Repack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepackConsumption" (
    "id" TEXT NOT NULL,
    "repackId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(14,0) NOT NULL,

    CONSTRAINT "RepackConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "area" TEXT,
    "isCustomer" BOOLEAN NOT NULL DEFAULT true,
    "isSupplier" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "amount" DECIMAL(14,0) NOT NULL,
    "billId" TEXT,
    "paymentId" TEXT,
    "dueDate" TIMESTAMP(3),
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "direction" "PaymentDirection" NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "amount" DECIMAL(14,0) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "ledgerEntryId" TEXT NOT NULL,
    "amount" DECIMAL(14,0) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesBill" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "partyId" TEXT,
    "number" TEXT NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'SAVED',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL(14,0) NOT NULL,
    "discount" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "taxable" DECIMAL(14,0) NOT NULL,
    "cgst" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "roundOff" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,0) NOT NULL,
    "paid" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "SalesBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesBillLine" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "rate" DECIMAL(14,0) NOT NULL,
    "discount" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "taxable" DECIMAL(14,0) NOT NULL,
    "gstRate" INTEGER NOT NULL,
    "cgst" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,0) NOT NULL,

    CONSTRAINT "SalesBillLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseBill" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "number" TEXT NOT NULL,
    "supplierBillNumber" TEXT,
    "status" "BillStatus" NOT NULL DEFAULT 'SAVED',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL(14,0) NOT NULL,
    "taxable" DECIMAL(14,0) NOT NULL,
    "cgst" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,0) NOT NULL,
    "paid" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "PurchaseBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseBillLine" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "rate" DECIMAL(14,0) NOT NULL,
    "taxable" DECIMAL(14,0) NOT NULL,
    "gstRate" INTEGER NOT NULL DEFAULT 0,
    "cgst" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,0) NOT NULL,

    CONSTRAINT "PurchaseBillLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseBudget" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,0) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "budgetId" TEXT,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "total" DECIMAL(14,0) NOT NULL,
    "overrideReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "rate" DECIMAL(14,0) NOT NULL,
    "receivedQty" DECIMAL(12,3) NOT NULL DEFAULT 0,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FestivalNote" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "leadDays" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FestivalNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "preview" JSONB NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "committedAt" TIMESTAMP(3),
    "result" JSONB,
    "source" "Source" NOT NULL DEFAULT 'TOUCH',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEntry" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "ownerId" TEXT,
    "source" "Source" NOT NULL,
    "operation" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Owner_shopId_idx" ON "Owner"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_tokenHash_key" ON "DeviceToken"("tokenHash");

-- CreateIndex
CREATE INDEX "DeviceToken_ownerId_idx" ON "DeviceToken"("ownerId");

-- CreateIndex
CREATE INDEX "Item_shopId_packOfItemId_idx" ON "Item"("shopId", "packOfItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_shopId_name_key" ON "Item"("shopId", "name");

-- CreateIndex
CREATE INDEX "StockBatch_itemId_receivedAt_idx" ON "StockBatch"("itemId", "receivedAt");

-- CreateIndex
CREATE INDEX "StockBatch_expiryDate_idx" ON "StockBatch"("expiryDate");

-- CreateIndex
CREATE INDEX "StockMovement_itemId_createdAt_idx" ON "StockMovement"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_referenceType_referenceId_idx" ON "StockMovement"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "Repack_shopId_createdAt_idx" ON "Repack"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "Repack_baseItemId_idx" ON "Repack"("baseItemId");

-- CreateIndex
CREATE INDEX "Repack_packItemId_idx" ON "Repack"("packItemId");

-- CreateIndex
CREATE INDEX "RepackConsumption_repackId_idx" ON "RepackConsumption"("repackId");

-- CreateIndex
CREATE INDEX "Party_shopId_phone_idx" ON "Party"("shopId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Party_shopId_name_key" ON "Party"("shopId", "name");

-- CreateIndex
CREATE INDEX "LedgerEntry_partyId_direction_createdAt_idx" ON "LedgerEntry"("partyId", "direction", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reversalOfId_key" ON "Payment"("reversalOfId");

-- CreateIndex
CREATE INDEX "Payment_shopId_paidAt_idx" ON "Payment"("shopId", "paidAt");

-- CreateIndex
CREATE INDEX "Payment_partyId_direction_idx" ON "Payment"("partyId", "direction");

-- CreateIndex
CREATE INDEX "PaymentAllocation_ledgerEntryId_idx" ON "PaymentAllocation"("ledgerEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_paymentId_ledgerEntryId_key" ON "PaymentAllocation"("paymentId", "ledgerEntryId");

-- CreateIndex
CREATE INDEX "SalesBill_shopId_issuedAt_idx" ON "SalesBill"("shopId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SalesBill_shopId_number_key" ON "SalesBill"("shopId", "number");

-- CreateIndex
CREATE INDEX "SalesBillLine_billId_idx" ON "SalesBillLine"("billId");

-- CreateIndex
CREATE INDEX "SalesBillLine_itemId_idx" ON "SalesBillLine"("itemId");

-- CreateIndex
CREATE INDEX "PurchaseBill_shopId_receivedAt_idx" ON "PurchaseBill"("shopId", "receivedAt");

-- CreateIndex
CREATE INDEX "PurchaseBill_supplierId_idx" ON "PurchaseBill"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseBill_shopId_number_key" ON "PurchaseBill"("shopId", "number");

-- CreateIndex
CREATE INDEX "PurchaseBillLine_billId_idx" ON "PurchaseBillLine"("billId");

-- CreateIndex
CREATE INDEX "PurchaseBillLine_itemId_idx" ON "PurchaseBillLine"("itemId");

-- CreateIndex
CREATE INDEX "PurchaseBudget_shopId_startDate_endDate_idx" ON "PurchaseBudget"("shopId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "PurchaseOrder_shopId_status_idx" ON "PurchaseOrder"("shopId", "status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_orderId_idx" ON "PurchaseOrderLine"("orderId");

-- CreateIndex
CREATE INDEX "FestivalNote_shopId_startsOn_idx" ON "FestivalNote"("shopId", "startsOn");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_idempotencyKey_key" ON "Proposal"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Proposal_shopId_status_expiresAt_idx" ON "Proposal"("shopId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "AuditEntry_shopId_createdAt_idx" ON "AuditEntry"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEntry_entityType_entityId_idx" ON "AuditEntry"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Owner" ADD CONSTRAINT "Owner_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_packOfItemId_fkey" FOREIGN KEY ("packOfItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "StockBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepackConsumption" ADD CONSTRAINT "RepackConsumption_repackId_fkey" FOREIGN KEY ("repackId") REFERENCES "Repack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesBill" ADD CONSTRAINT "SalesBill_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesBillLine" ADD CONSTRAINT "SalesBillLine_billId_fkey" FOREIGN KEY ("billId") REFERENCES "SalesBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesBillLine" ADD CONSTRAINT "SalesBillLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBill" ADD CONSTRAINT "PurchaseBill_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBill" ADD CONSTRAINT "PurchaseBill_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBillLine" ADD CONSTRAINT "PurchaseBillLine_billId_fkey" FOREIGN KEY ("billId") REFERENCES "PurchaseBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBillLine" ADD CONSTRAINT "PurchaseBillLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "PurchaseBudget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEntry" ADD CONSTRAINT "AuditEntry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
