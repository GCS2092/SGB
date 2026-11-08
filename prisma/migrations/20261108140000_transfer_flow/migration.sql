-- AlterEnum
ALTER TYPE "TransferStatus" ADD VALUE 'SHIPPED';
ALTER TYPE "TransferStatus" ADD VALUE 'RECEIVED';

-- AlterTable
ALTER TABLE "StockTransfer" ADD COLUMN "shippedBy" TEXT,
ADD COLUMN "shippedAt" TIMESTAMP(3),
ADD COLUMN "receivedBy" TEXT,
ADD COLUMN "receivedAt" TIMESTAMP(3),
ADD COLUMN "receiveNotes" TEXT;

-- AlterTable
ALTER TABLE "StockTransferItem" ADD COLUMN "quantityReceived" INTEGER,
ADD COLUMN "receiveNote" TEXT;