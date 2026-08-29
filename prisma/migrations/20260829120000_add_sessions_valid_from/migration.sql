-- Session cutoff for password resets: a JWT issued before this instant is
-- refused, so resetting a password evicts sessions that are already signed in.
-- Nullable with no default — existing users have never reset, so every token
-- they hold stays valid.
ALTER TABLE "User" ADD COLUMN "sessionsValidFrom" TIMESTAMP(3);
