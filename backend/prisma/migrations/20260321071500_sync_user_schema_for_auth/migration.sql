-- Ensure users table has fields expected by current Prisma schema and auth service
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "isSuspended" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "lastLogin" TIMESTAMP(3);

-- Ensure UserRole enum supports current application roles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'UserRole' AND e.enumlabel = 'DSL_DESIGNER'
  ) THEN
    ALTER TYPE "UserRole" ADD VALUE 'DSL_DESIGNER';
  END IF;
END $$;
