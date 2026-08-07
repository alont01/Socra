-- TutorProfile: matching capacity + availability
ALTER TABLE "TutorProfile" ADD COLUMN "maxHoursPerWeek" INTEGER;
ALTER TABLE "TutorProfile" ADD COLUMN "availability" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "TutorProfile" ADD COLUMN "acceptingStudents" BOOLEAN NOT NULL DEFAULT true;

-- StudentProfile: desired hours + availability
ALTER TABLE "StudentProfile" ADD COLUMN "desiredHoursPerWeek" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "StudentProfile" ADD COLUMN "availability" TEXT NOT NULL DEFAULT '[]';

-- TutorStudent: committed load + lifecycle
ALTER TABLE "TutorStudent" ADD COLUMN "hoursPerWeek" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "TutorStudent" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
CREATE INDEX "TutorStudent_studentId_status_idx" ON "TutorStudent"("studentId", "status");

-- Enforce at most one ACTIVE tutor per student. This partial unique index is
-- what makes offer-accept atomic: a concurrent second accept fails the insert.
CREATE UNIQUE INDEX "TutorStudent_one_active_tutor_per_student"
  ON "TutorStudent"("studentId") WHERE "status" = 'active';

-- TutorMatchOffer
CREATE TABLE "TutorMatchOffer" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overlapSlots" TEXT NOT NULL DEFAULT '[]',
    "batch" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    CONSTRAINT "TutorMatchOffer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TutorMatchOffer_studentId_tutorId_key" ON "TutorMatchOffer"("studentId", "tutorId");
CREATE INDEX "TutorMatchOffer_tutorId_status_idx" ON "TutorMatchOffer"("tutorId", "status");
CREATE INDEX "TutorMatchOffer_studentId_status_idx" ON "TutorMatchOffer"("studentId", "status");

ALTER TABLE "TutorMatchOffer" ADD CONSTRAINT "TutorMatchOffer_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TutorMatchOffer" ADD CONSTRAINT "TutorMatchOffer_tutorId_fkey"
  FOREIGN KEY ("tutorId") REFERENCES "TutorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
