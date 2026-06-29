-- AlterTable
ALTER TABLE "PracticeSet" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'assigned';
ALTER TABLE "PracticeSet" ADD COLUMN "assignedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PracticeSet_studentId_status_idx" ON "PracticeSet"("studentId", "status");

-- Existing rows were already visible to students, so backfill assignedAt to their
-- creation time to preserve "assigned" semantics for pre-existing homework.
UPDATE "PracticeSet" SET "assignedAt" = "createdAt" WHERE "assignedAt" IS NULL;
