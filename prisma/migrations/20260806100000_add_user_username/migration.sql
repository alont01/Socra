-- AlterTable: optional login handle for parent-created student accounts.
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- CreateIndex: unique when present (multiple NULLs allowed in Postgres).
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
