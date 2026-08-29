-- 1. Mark placeholder analyses as such.
--
-- When analysis fails (or there was nothing to analyze) the pipeline still
-- writes a SessionAnalysis row so it stays idempotent and the review page has
-- something to poll. But the row is indistinguishable from a real one, so the
-- apology text was rendered as the session recap — including to parents, who
-- read it as their child's lesson summary.

ALTER TABLE "SessionAnalysis" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ok';

-- Backfill: the two placeholder summaries were written verbatim by
-- lib/session-processing.ts, so existing rows can be classified exactly.
UPDATE "SessionAnalysis"
SET "status" = 'failed'
WHERE "summary" = 'Analysis could not be generated. Please try again later.';

UPDATE "SessionAnalysis"
SET "status" = 'insufficient'
WHERE "summary" LIKE 'Not enough was captured from this session%';

-- A real analysis always names at least one concept; a placeholder never does.
-- This catches rows from earlier variants of the placeholder text.
UPDATE "SessionAnalysis"
SET "status" = 'failed'
WHERE "status" = 'ok'
  AND "conceptsCovered" IN ('[]', '')
  AND "studentStrengths" IN ('[]', '')
  AND "studentGaps" IN ('[]', '');

-- 2. One graded answer per live-practice problem, per session.
--
-- Live practice grades against a signed answer token, so the server kept no
-- record that a problem had been answered. The same token could be replayed —
-- submit, read the revealed answer, submit again — and every replay moved
-- mastery. Mastery is what parents read as progress and what practice
-- generation targets, so a replay corrupts both.

CREATE TABLE "LivePracticeAttempt" (
    "id" TEXT NOT NULL,
    "tutoringSessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "topic" TEXT NOT NULL DEFAULT '',
    "studentAnswer" TEXT NOT NULL DEFAULT '',
    "correct" BOOLEAN NOT NULL DEFAULT false,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LivePracticeAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LivePracticeAttempt_tutoringSessionId_problemId_key"
    ON "LivePracticeAttempt"("tutoringSessionId", "problemId");

CREATE INDEX "LivePracticeAttempt_tutoringSessionId_idx"
    ON "LivePracticeAttempt"("tutoringSessionId");

CREATE INDEX "LivePracticeAttempt_studentId_idx"
    ON "LivePracticeAttempt"("studentId");

ALTER TABLE "LivePracticeAttempt"
    ADD CONSTRAINT "LivePracticeAttempt_tutoringSessionId_fkey"
    FOREIGN KEY ("tutoringSessionId") REFERENCES "TutoringSession"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
