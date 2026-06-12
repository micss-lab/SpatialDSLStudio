-- Add Sirius-style viewpoint specifications while keeping diagrams as the
-- compatibility table for concrete View / representation instances.

CREATE TABLE "viewpoints" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "metamodelId" TEXT NOT NULL,
    "representationDescriptions" JSONB NOT NULL DEFAULT '[]',
    "sharedConcreteSyntax" JSONB NOT NULL DEFAULT '{}',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "viewpoints_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "viewpoints_metamodelId_name_userId_key" ON "viewpoints"("metamodelId", "name", "userId");

ALTER TABLE "viewpoints" ADD CONSTRAINT "viewpoints_metamodelId_fkey"
    FOREIGN KEY ("metamodelId") REFERENCES "metamodels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "viewpoints" ADD CONSTRAINT "viewpoints_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "diagrams" ADD COLUMN "viewpointId" TEXT;
ALTER TABLE "diagrams" ADD COLUMN "representationDescriptionId" TEXT;

ALTER TABLE "diagrams" ADD CONSTRAINT "diagrams_viewpointId_fkey"
    FOREIGN KEY ("viewpointId") REFERENCES "viewpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE;
