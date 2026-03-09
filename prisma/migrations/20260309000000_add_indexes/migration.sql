-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "TutoringSession_tutorId_idx" ON "TutoringSession"("tutorId");

-- CreateIndex
CREATE INDEX "TutoringSession_studentId_idx" ON "TutoringSession"("studentId");

-- CreateIndex
CREATE INDEX "TutoringSession_status_idx" ON "TutoringSession"("status");

-- CreateIndex
CREATE INDEX "PracticeSet_studentId_idx" ON "PracticeSet"("studentId");

-- CreateIndex
CREATE INDEX "PracticeSet_tutoringSessionId_idx" ON "PracticeSet"("tutoringSessionId");

-- CreateIndex
CREATE INDEX "PracticeSetAttempt_practiceSetId_idx" ON "PracticeSetAttempt"("practiceSetId");
