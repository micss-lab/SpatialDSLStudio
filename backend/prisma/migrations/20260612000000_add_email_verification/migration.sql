ALTER TABLE "users" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;

UPDATE "users" SET "emailVerified" = true;

CREATE TABLE "email_verification_codes" (
  "id" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "email_verification_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "email_verification_codes_userId_usedAt_idx" ON "email_verification_codes"("userId", "usedAt");

ALTER TABLE "email_verification_codes" ADD CONSTRAINT "email_verification_codes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
