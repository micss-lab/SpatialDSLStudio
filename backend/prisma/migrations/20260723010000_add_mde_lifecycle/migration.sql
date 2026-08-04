CREATE TYPE "MetamodelMigrationStatus" AS ENUM ('APPLIED', 'FAILED');
CREATE TYPE "PipelineRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "project_checkpoints" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "tag" TEXT,
    "message" TEXT,
    "manifest" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_checkpoints_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "metamodel_migrations" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "metamodelId" TEXT NOT NULL,
    "sourceCheckpointId" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "targetHash" TEXT NOT NULL,
    "status" "MetamodelMigrationStatus" NOT NULL,
    "changeSet" JSONB NOT NULL,
    "impactReport" JSONB NOT NULL,
    "migrationReport" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "metamodel_migrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pipeline_runs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "PipelineRunStatus" NOT NULL DEFAULT 'RUNNING',
    "definition" JSONB NOT NULL,
    "result" JSONB,
    "sourceCheckpointId" TEXT,
    "contentHash" TEXT,
    "failureMessage" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "pipeline_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_checkpoints_projectId_sequence_key"
    ON "project_checkpoints"("projectId", "sequence");
CREATE UNIQUE INDEX "project_checkpoints_projectId_tag_key"
    ON "project_checkpoints"("projectId", "tag");
CREATE INDEX "project_checkpoints_projectId_createdAt_idx"
    ON "project_checkpoints"("projectId", "createdAt");
CREATE INDEX "metamodel_migrations_projectId_metamodelId_createdAt_idx"
    ON "metamodel_migrations"("projectId", "metamodelId", "createdAt");
CREATE INDEX "pipeline_runs_projectId_createdAt_idx"
    ON "pipeline_runs"("projectId", "createdAt");

ALTER TABLE "project_checkpoints" ADD CONSTRAINT "project_checkpoints_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "studio_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_checkpoints" ADD CONSTRAINT "project_checkpoints_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "metamodel_migrations" ADD CONSTRAINT "metamodel_migrations_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "studio_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "metamodel_migrations" ADD CONSTRAINT "metamodel_migrations_sourceCheckpointId_fkey"
    FOREIGN KEY ("sourceCheckpointId") REFERENCES "project_checkpoints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "metamodel_migrations" ADD CONSTRAINT "metamodel_migrations_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "studio_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_sourceCheckpointId_fkey"
    FOREIGN KEY ("sourceCheckpointId") REFERENCES "project_checkpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
