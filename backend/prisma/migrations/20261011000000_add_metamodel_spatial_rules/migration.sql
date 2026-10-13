-- Declarative spatial rules are part of the metamodel (language) definition.
ALTER TABLE "metamodels" ADD COLUMN "spatialRules" JSONB NOT NULL DEFAULT '[]';
