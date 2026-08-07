-- Live-caption buffer captured during the call; fallback for post-session analysis.
ALTER TABLE "TutoringSession" ADD COLUMN "liveTranscript" TEXT NOT NULL DEFAULT '';
