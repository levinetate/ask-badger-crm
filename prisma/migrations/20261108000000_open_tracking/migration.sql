-- Open tracking for estimates and invoices
ALTER TABLE "BusinessSettings" ADD COLUMN "notifyOnOpen" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Estimate" ADD COLUMN "openedAt" TIMESTAMP(3), ADD COLUMN "viewedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "openedAt" TIMESTAMP(3), ADD COLUMN "viewedAt" TIMESTAMP(3);
