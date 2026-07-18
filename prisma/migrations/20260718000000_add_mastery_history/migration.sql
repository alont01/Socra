-- CreateTable
CREATE TABLE "MasteryHistory" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "mastery" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'session',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MasteryHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MasteryHistory_studentId_createdAt_idx" ON "MasteryHistory"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "MasteryHistory_studentId_topic_createdAt_idx" ON "MasteryHistory"("studentId", "topic", "createdAt");

-- AddForeignKey
ALTER TABLE "MasteryHistory" ADD CONSTRAINT "MasteryHistory_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
