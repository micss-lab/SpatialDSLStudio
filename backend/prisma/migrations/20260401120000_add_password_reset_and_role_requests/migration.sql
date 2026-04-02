-- CreateEnum
CREATE TYPE "RoleRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable: Change default role from DSL_DESIGNER to VIEWER
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'VIEWER';

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentRole" "UserRole" NOT NULL,
    "requestedRole" "UserRole" NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RoleRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
