-- CreateEnum
CREATE TYPE "PatternType" AS ENUM ('LHS', 'RHS', 'NAC');

-- CreateEnum
CREATE TYPE "TransformationStrategy" AS ENUM ('sequential', 'priority', 'interactive');

-- CreateEnum
CREATE TYPE "TransformationStatus" AS ENUM ('created', 'in_progress', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "TestCaseType" AS ENUM ('attribute', 'reference', 'constraint', 'reference_attribute');

-- CreateEnum
CREATE TYPE "TestCaseStatus" AS ENUM ('pending', 'running', 'passed', 'failed');

-- CreateEnum
CREATE TYPE "ConstraintType" AS ENUM ('ocl', 'javascript');

-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('image', 'model', 'other');

-- CreateTable
CREATE TABLE "e_packages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nsURI" TEXT NOT NULL,
    "nsPrefix" TEXT NOT NULL,
    "classes" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "e_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metamodels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "uri" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "eClass" TEXT,
    "classes" JSONB NOT NULL DEFAULT '[]',
    "constraints" JSONB NOT NULL DEFAULT '[]',
    "conformsToId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metamodels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "models" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metamodelId" TEXT NOT NULL,
    "elements" JSONB NOT NULL DEFAULT '[]',
    "connections" JSONB NOT NULL DEFAULT '[]',
    "conformsToId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagrams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "elements" JSONB NOT NULL DEFAULT '[]',
    "gridSettings" JSONB NOT NULL DEFAULT '{"sizeX": 20000, "sizeY": 20000}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diagrams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transformation_patterns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PatternType" NOT NULL,
    "elements" JSONB NOT NULL DEFAULT '[]',
    "diagramId" TEXT,
    "globalExpression" JSONB,
    "globalExpressionTarget" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transformation_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transformation_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "lhsId" TEXT NOT NULL,
    "rhsId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transformation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transformation_rule_nacs" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "patternId" TEXT NOT NULL,

    CONSTRAINT "transformation_rule_nacs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transformation_executions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inPlace" BOOLEAN NOT NULL DEFAULT false,
    "maxIterations" INTEGER NOT NULL DEFAULT 100,
    "strategy" "TransformationStrategy" NOT NULL DEFAULT 'sequential',
    "status" "TransformationStatus" NOT NULL DEFAULT 'created',
    "sourceModelId" TEXT NOT NULL,
    "targetModelId" TEXT,
    "resultModelId" TEXT,
    "stepResults" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transformation_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transformation_execution_rules" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,

    CONSTRAINT "transformation_execution_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_generation_projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isExample" BOOLEAN NOT NULL DEFAULT false,
    "targetMetamodelId" TEXT NOT NULL,
    "templates" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "code_generation_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_cases" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "TestCaseType" NOT NULL,
    "targetMetaClassId" TEXT NOT NULL,
    "targetMetaClassName" TEXT NOT NULL,
    "targetProperty" TEXT,
    "status" "TestCaseStatus" NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "constraintId" TEXT,
    "constraintType" "ConstraintType",
    "originalInput" JSONB,
    "expectedOutput" JSONB,
    "actualOutput" JSONB,
    "testValues" JSONB NOT NULL DEFAULT '[]',
    "modelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimetype" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "type" "FileType" NOT NULL,
    "data" BYTEA NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "e_packages_nsURI_key" ON "e_packages"("nsURI");

-- CreateIndex
CREATE UNIQUE INDEX "transformation_rule_nacs_ruleId_patternId_key" ON "transformation_rule_nacs"("ruleId", "patternId");

-- CreateIndex
CREATE UNIQUE INDEX "transformation_execution_rules_executionId_ruleId_key" ON "transformation_execution_rules"("executionId", "ruleId");

-- AddForeignKey
ALTER TABLE "metamodels" ADD CONSTRAINT "metamodels_conformsToId_fkey" FOREIGN KEY ("conformsToId") REFERENCES "e_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "models" ADD CONSTRAINT "models_conformsToId_fkey" FOREIGN KEY ("conformsToId") REFERENCES "metamodels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagrams" ADD CONSTRAINT "diagrams_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transformation_rules" ADD CONSTRAINT "transformation_rules_lhsId_fkey" FOREIGN KEY ("lhsId") REFERENCES "transformation_patterns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transformation_rules" ADD CONSTRAINT "transformation_rules_rhsId_fkey" FOREIGN KEY ("rhsId") REFERENCES "transformation_patterns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transformation_rule_nacs" ADD CONSTRAINT "transformation_rule_nacs_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "transformation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transformation_rule_nacs" ADD CONSTRAINT "transformation_rule_nacs_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "transformation_patterns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transformation_executions" ADD CONSTRAINT "transformation_executions_sourceModelId_fkey" FOREIGN KEY ("sourceModelId") REFERENCES "models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transformation_executions" ADD CONSTRAINT "transformation_executions_targetModelId_fkey" FOREIGN KEY ("targetModelId") REFERENCES "models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transformation_executions" ADD CONSTRAINT "transformation_executions_resultModelId_fkey" FOREIGN KEY ("resultModelId") REFERENCES "models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transformation_execution_rules" ADD CONSTRAINT "transformation_execution_rules_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "transformation_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transformation_execution_rules" ADD CONSTRAINT "transformation_execution_rules_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "transformation_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_generation_projects" ADD CONSTRAINT "code_generation_projects_targetMetamodelId_fkey" FOREIGN KEY ("targetMetamodelId") REFERENCES "metamodels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "models"("id") ON DELETE CASCADE ON UPDATE CASCADE;
