-- One attempt per problem, enforced by the database.
--
-- The route checked for an existing attempt and then created one, which two
-- concurrent submissions both pass — so a single problem could be recorded
-- twice and move the student's mastery twice. Mastery is what parents read as
-- progress and what practice generation targets, so a duplicate corrupts both.
-- Application-level checks cannot close this; the constraint can.

-- Existing duplicates must go first or the index cannot be created. Keep the
-- earliest attempt for each problem, which is the one the code always intended
-- to count ("only first attempt counts for mastery"); id breaks exact ties.
DELETE FROM "PracticeSetAttempt" a
USING "PracticeSetAttempt" b
WHERE a."practiceSetId" = b."practiceSetId"
  AND a."problemIndex" = b."problemIndex"
  AND (
    a."attemptedAt" > b."attemptedAt"
    OR (a."attemptedAt" = b."attemptedAt" AND a."id" > b."id")
  );

CREATE UNIQUE INDEX "PracticeSetAttempt_practiceSetId_problemIndex_key"
    ON "PracticeSetAttempt"("practiceSetId", "problemIndex");
