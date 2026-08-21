-- Invoice: webhook-driven payment status.
--
-- `statusUpdatedAt` + `stripeEventId` exist to survive Stripe's out-of-order
-- webhook delivery: an event older than the one that last set `status` is
-- ignored, so a delayed payment_failed can't flip a paid invoice back.
ALTER TABLE "Invoice" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "statusUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "stripeEventId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "lastError" TEXT;

-- TutoringSession: intended duration, so billing can cap a session that was
-- left open. Existing rows default to 60 minutes.
ALTER TABLE "TutoringSession" ADD COLUMN "scheduledMinutes" INTEGER NOT NULL DEFAULT 60;

-- Marks sessions ended by the stale-session sweeper rather than by the tutor.
ALTER TABLE "TutoringSession" ADD COLUMN "autoClosed" BOOLEAN NOT NULL DEFAULT false;

-- The sweeper scans for long-running active sessions; without this the scan is
-- a full table scan that grows with history.
CREATE INDEX "TutoringSession_status_startedAt_idx" ON "TutoringSession"("status", "startedAt");
