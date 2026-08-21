-- Last observed state per external integration, so alerting can fire on a
-- transition (healthy → broken, broken → healthy) instead of on every hourly
-- probe. Without this the alert channel becomes noise and gets ignored.
CREATE TABLE "IntegrationCheck" (
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "lastOkAt" TIMESTAMP(3),
    "alertedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntegrationCheck_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "IntegrationCheck_status_idx" ON "IntegrationCheck"("status");
