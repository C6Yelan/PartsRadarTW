ALTER TABLE "discord_privacy_verification_requests"
  ALTER COLUMN "discord_user_id" DROP NOT NULL,
  ALTER COLUMN "code_digest" DROP NOT NULL;

UPDATE "discord_privacy_verification_requests"
SET
  "discord_user_id" = NULL,
  "code_digest" = NULL
WHERE
  "consumed_at" IS NOT NULL
  OR "cancelled_at" IS NOT NULL
  OR "expires_at" <= CURRENT_TIMESTAMP;
