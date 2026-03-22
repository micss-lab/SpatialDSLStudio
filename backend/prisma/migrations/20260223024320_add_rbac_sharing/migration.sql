/*
  Warnings:

  - You are about to drop the column `lhsId` on the `transformation_rules` table. All the data in the column will be lost.
  - You are about to drop the column `rhsId` on the `transformation_rules` table. All the data in the column will be lost.
  - You are about to drop the `transformation_execution_rules` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `transformation_executions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `transformation_patterns` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `transformation_rule_nacs` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[nsURI,userId]` on the table `e_packages` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `userId` to the `code_generation_projects` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `diagrams` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `e_packages` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `metamodels` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `models` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `stored_files` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `test_cases` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `transformation_rules` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MODELER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('METAMODEL', 'MODEL', 'DIAGRAM', 'TRANSFORMATION_RULE', 'CODEGEN_PROJECT', 'TEST_CASE');

-- CreateEnum
CREATE TYPE "SharePermission" AS ENUM ('VIEWER', 'EDITOR');

-- DropForeignKey
ALTER TABLE "code_generation_projects" DROP CONSTRAINT "code_generation_projects_targetMetamodelId_fkey";

-- DropForeignKey
ALTER TABLE "test_cases" DROP CONSTRAINT "test_cases_modelId_fkey";

-- DropForeignKey
ALTER TABLE "transformation_execution_rules" DROP CONSTRAINT "transformation_execution_rules_executionId_fkey";

-- DropForeignKey
ALTER TABLE "transformation_execution_rules" DROP CONSTRAINT "transformation_execution_rules_ruleId_fkey";

-- DropForeignKey
ALTER TABLE "transformation_executions" DROP CONSTRAINT "transformation_executions_resultModelId_fkey";

-- DropForeignKey
ALTER TABLE "transformation_executions" DROP CONSTRAINT "transformation_executions_sourceModelId_fkey";

-- DropForeignKey
ALTER TABLE "transformation_executions" DROP CONSTRAINT "transformation_executions_targetModelId_fkey";

-- DropForeignKey
ALTER TABLE "transformation_rule_nacs" DROP CONSTRAINT "transformation_rule_nacs_patternId_fkey";

-- DropForeignKey
ALTER TABLE "transformation_rule_nacs" DROP CONSTRAINT "transformation_rule_nacs_ruleId_fkey";

-- DropForeignKey
ALTER TABLE "transformation_rules" DROP CONSTRAINT "transformation_rules_lhsId_fkey";

-- DropForeignKey
ALTER TABLE "transformation_rules" DROP CONSTRAINT "transformation_rules_rhsId_fkey";

-- DropIndex
DROP INDEX "e_packages_nsURI_key";

-- AlterTable
ALTER TABLE "code_generation_projects" ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "diagrams" ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "e_packages" ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "metamodels" ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "models" ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "stored_files" ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "test_cases" ADD COLUMN     "userId" TEXT NOT NULL,
ALTER COLUMN "modelId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "transformation_rules" DROP COLUMN "lhsId",
DROP COLUMN "rhsId",
ADD COLUMN     "diagramId" TEXT,
ADD COLUMN     "lhs" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "nacs" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "rhs" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "userId" TEXT NOT NULL;

-- DropTable
DROP TABLE "transformation_execution_rules";

-- DropTable
DROP TABLE "transformation_executions";

-- DropTable
DROP TABLE "transformation_patterns";

-- DropTable
DROP TABLE "transformation_rule_nacs";

-- DropEnum
DROP TYPE "PatternType";

-- DropEnum
DROP TYPE "TransformationStatus";

-- DropEnum
DROP TYPE "TransformationStrategy";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MODELER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shared_resources" (
    "id" TEXT NOT NULL,
    "resourceType" "ResourceType" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "permission" "SharePermission" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sharedWithId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shared_resources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "shared_resources_resourceType_resourceId_sharedWithId_key" ON "shared_resources"("resourceType", "resourceId", "sharedWithId");

-- CreateIndex
CREATE UNIQUE INDEX "e_packages_nsURI_userId_key" ON "e_packages"("nsURI", "userId");

-- AddForeignKey
ALTER TABLE "shared_resources" ADD CONSTRAINT "shared_resources_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_resources" ADD CONSTRAINT "shared_resources_sharedWithId_fkey" FOREIGN KEY ("sharedWithId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "e_packages" ADD CONSTRAINT "e_packages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metamodels" ADD CONSTRAINT "metamodels_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "models" ADD CONSTRAINT "models_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagrams" ADD CONSTRAINT "diagrams_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transformation_rules" ADD CONSTRAINT "transformation_rules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_generation_projects" ADD CONSTRAINT "code_generation_projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
