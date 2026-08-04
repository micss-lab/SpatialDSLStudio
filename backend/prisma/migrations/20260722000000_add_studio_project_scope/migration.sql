-- StudioProject is an additive workspace/security boundary. Existing userId
-- columns are retained as creator attribution and for legacy flat endpoints.

CREATE TYPE "ProjectRole" AS ENUM ('OWNER', 'DSL_DESIGNER', 'MODELER', 'VIEWER');
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TABLE "studio_projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_memberships" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_memberships_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "e_packages" ADD COLUMN "projectId" TEXT;
ALTER TABLE "metamodels" ADD COLUMN "projectId" TEXT;
ALTER TABLE "viewpoints" ADD COLUMN "projectId" TEXT;
ALTER TABLE "models" ADD COLUMN "projectId" TEXT;
ALTER TABLE "diagrams" ADD COLUMN "projectId" TEXT;
ALTER TABLE "transformation_rules" ADD COLUMN "projectId" TEXT;
ALTER TABLE "code_generation_projects" ADD COLUMN "projectId" TEXT;
ALTER TABLE "test_cases" ADD COLUMN "projectId" TEXT;
ALTER TABLE "stored_files" ADD COLUMN "projectId" TEXT;

CREATE INDEX "studio_projects_ownerId_idx" ON "studio_projects"("ownerId");
CREATE INDEX "studio_projects_status_idx" ON "studio_projects"("status");
CREATE UNIQUE INDEX "project_memberships_projectId_userId_key" ON "project_memberships"("projectId", "userId");
CREATE INDEX "project_memberships_userId_idx" ON "project_memberships"("userId");
DROP INDEX "e_packages_nsURI_userId_key";
CREATE UNIQUE INDEX "e_packages_projectId_nsURI_key" ON "e_packages"("projectId", "nsURI");
CREATE INDEX "e_packages_projectId_idx" ON "e_packages"("projectId");
CREATE INDEX "metamodels_projectId_idx" ON "metamodels"("projectId");
CREATE INDEX "viewpoints_projectId_idx" ON "viewpoints"("projectId");
CREATE INDEX "models_projectId_idx" ON "models"("projectId");
CREATE INDEX "diagrams_projectId_idx" ON "diagrams"("projectId");
CREATE INDEX "transformation_rules_projectId_idx" ON "transformation_rules"("projectId");
CREATE INDEX "code_generation_projects_projectId_idx" ON "code_generation_projects"("projectId");
CREATE INDEX "test_cases_projectId_idx" ON "test_cases"("projectId");
CREATE INDEX "stored_files_projectId_idx" ON "stored_files"("projectId");

ALTER TABLE "studio_projects" ADD CONSTRAINT "studio_projects_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "studio_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Give every existing user one private legacy project and place their owned
-- artifact graph in it. Existing per-resource shares remain unchanged and are
-- intentionally not widened into project memberships.
INSERT INTO "studio_projects" ("id", "name", "description", "status", "ownerId", "createdAt", "updatedAt")
SELECT "id", 'Legacy Project', 'Automatically created for existing artifacts', 'ACTIVE', "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users";

INSERT INTO "project_memberships" ("id", "projectId", "userId", "role", "createdAt", "updatedAt")
SELECT "id", "id", "id", 'OWNER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users";

UPDATE "e_packages" SET "projectId" = "userId";
UPDATE "metamodels" SET "projectId" = "userId";
UPDATE "viewpoints" SET "projectId" = "userId";
UPDATE "models" SET "projectId" = "userId";
UPDATE "diagrams" SET "projectId" = "userId";
UPDATE "transformation_rules" SET "projectId" = "userId";
UPDATE "code_generation_projects" SET "projectId" = "userId";
UPDATE "test_cases" SET "projectId" = "userId";
UPDATE "stored_files" SET "projectId" = "userId";

ALTER TABLE "e_packages" ADD CONSTRAINT "e_packages_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "studio_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "metamodels" ADD CONSTRAINT "metamodels_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "studio_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "viewpoints" ADD CONSTRAINT "viewpoints_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "studio_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "models" ADD CONSTRAINT "models_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "studio_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "diagrams" ADD CONSTRAINT "diagrams_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "studio_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transformation_rules" ADD CONSTRAINT "transformation_rules_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "studio_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "code_generation_projects" ADD CONSTRAINT "code_generation_projects_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "studio_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "studio_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "studio_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
