-- ParentProfile: Stripe customer link, set lazily on first invoice.
ALTER TABLE "ParentProfile" ADD COLUMN "stripeCustomerId" TEXT;
CREATE UNIQUE INDEX "ParentProfile_stripeCustomerId_key" ON "ParentProfile"("stripeCustomerId");

-- Invoice: local record of each monthly bill, independent audit trail from Stripe.
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "rateUsd" DOUBLE PRECISION NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "stripeInvoiceId" TEXT,
    "stripeInvoiceUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Invoice_stripeInvoiceId_key" ON "Invoice"("stripeInvoiceId");
CREATE UNIQUE INDEX "Invoice_parentId_periodStart_periodEnd_key" ON "Invoice"("parentId", "periodStart", "periodEnd");
CREATE INDEX "Invoice_parentId_idx" ON "Invoice"("parentId");
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "ParentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
