-- Timestamp for the "completing" claim held while an assessment's holistic
-- summary/mastery seeding runs. Lets a stuck claim (the process died mid-
-- flight — a deploy, an OOM — rather than throwing an error the app could
-- catch and roll back itself) be detected and taken over after a timeout,
-- the same pattern already used for a stuck `pending` Invoice claim.
-- Nullable with no default — existing rows are never mid-claim.
ALTER TABLE "Assessment" ADD COLUMN "completingAt" TIMESTAMP(3);
