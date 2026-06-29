-- AlterTable
ALTER TABLE "TutoringSession" ADD COLUMN "masteryApplied" BOOLEAN NOT NULL DEFAULT false;

-- Mark sessions whose original analysis actually counted concepts (mastery was
-- applied) so a future re-analysis does not double-count them. Sessions with a
-- failed/empty analysis ('[]') are left unmarked, so a successful retry can
-- still apply their mastery exactly once.
UPDATE "TutoringSession" SET "masteryApplied" = true
WHERE "status" = 'completed'
  AND EXISTS (
    SELECT 1 FROM "SessionAnalysis" sa
    WHERE sa."tutoringSessionId" = "TutoringSession"."id"
      AND sa."conceptsCovered" NOT IN ('[]', '')
  );
