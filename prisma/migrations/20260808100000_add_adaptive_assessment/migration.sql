-- Adaptive diagnostic assessment: one-at-a-time difficulty-ladder problems,
-- hybrid (auto + tutor override) grading, holistic result on completion.

CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "tutoringSessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "currentLevel" INTEGER NOT NULL DEFAULT 5,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "estimatedLevel" INTEGER,
    "summary" TEXT NOT NULL DEFAULT '',
    "strengths" TEXT NOT NULL DEFAULT '[]',
    "gaps" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Assessment_tutoringSessionId_key" ON "Assessment"("tutoringSessionId");
CREATE INDEX "Assessment_studentId_idx" ON "Assessment"("studentId");
CREATE INDEX "Assessment_status_idx" ON "Assessment"("status");
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_tutoringSessionId_fkey"
  FOREIGN KEY ("tutoringSessionId") REFERENCES "TutoringSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AssessmentItem" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "topic" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "hint" TEXT NOT NULL DEFAULT '',
    "answer" TEXT NOT NULL,
    "studentAnswer" TEXT,
    "autoCorrect" BOOLEAN,
    "tutorResult" TEXT,
    "finalCorrect" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    CONSTRAINT "AssessmentItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssessmentItem_assessmentId_index_key" ON "AssessmentItem"("assessmentId", "index");
CREATE INDEX "AssessmentItem_assessmentId_idx" ON "AssessmentItem"("assessmentId");
ALTER TABLE "AssessmentItem" ADD CONSTRAINT "AssessmentItem_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
