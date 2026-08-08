-- Truncated request/response previews for AI-call debugging.
ALTER TABLE "SystemEvent" ADD COLUMN "requestPreview" TEXT;
ALTER TABLE "SystemEvent" ADD COLUMN "responsePreview" TEXT;
