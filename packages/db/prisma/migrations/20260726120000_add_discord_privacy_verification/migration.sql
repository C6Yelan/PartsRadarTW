CREATE TYPE "discord_privacy_request_type" AS ENUM ('inspect', 'erase');

CREATE TABLE "discord_privacy_verification_requests" (
  "id" UUID NOT NULL,
  "request_type" "discord_privacy_request_type" NOT NULL,
  "discord_user_id" TEXT NOT NULL,
  "code_digest" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "verified_at" TIMESTAMPTZ(6),
  "consumed_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "discord_privacy_verification_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "discord_privacy_verification_attempts_check"
    CHECK ("attempt_count" >= 0 AND "max_attempts" BETWEEN 1 AND 10)
);

CREATE INDEX "discord_privacy_verification_user_created_at_idx"
ON "discord_privacy_verification_requests"("discord_user_id", "created_at");

CREATE INDEX "discord_privacy_verification_expires_at_idx"
ON "discord_privacy_verification_requests"("expires_at");
