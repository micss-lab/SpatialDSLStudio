-- Split the per-user Legacy Projects into one project per metamodel.
--
-- The metamodel drives the whole authoring workflow, so a project that contains
-- exactly one metamodel matches how the tool is actually used. The project name
-- comes from the metamodel and the project owner is the metamodel owner.
--
-- Artifacts follow their metamodel through the existing semantic links. The
-- ones that cannot reach a metamodel (test cases pointing at deleted models,
-- unlinked transformation rules, stored files) go to their owner's first
-- metamodel project. Users who never created a metamodel keep their Legacy
-- Project untouched.

-- ---------------------------------------------------------------------------
-- 1. One project per metamodel.
-- ---------------------------------------------------------------------------

-- Duplicate metamodel names under the same owner get a numeric suffix so the
-- project picker stays unambiguous. Names duplicated across different owners
-- are left alone; they are not confusable in a per-user listing.
CREATE TEMPORARY TABLE mm_project ON COMMIT PRESERVE ROWS AS
SELECT
  m.id                                          AS metamodel_id,
  m."userId"                                    AS owner_id,
  gen_random_uuid()                             AS project_id,
  CASE WHEN d.same_name_count > 1
       THEN m.name || ' (' || d.same_name_rank || ')'
       ELSE m.name
  END                                           AS project_name,
  m.description                                 AS metamodel_description,
  ROW_NUMBER() OVER (
    PARTITION BY m."userId" ORDER BY m."createdAt", m.id
  )                                             AS owner_rank
FROM metamodels m
JOIN (
  SELECT
    id,
    COUNT(*)     OVER (PARTITION BY "userId", name) AS same_name_count,
    ROW_NUMBER() OVER (
      PARTITION BY "userId", name ORDER BY "createdAt", id
    )                                               AS same_name_rank
  FROM metamodels
) d ON d.id = m.id;

INSERT INTO studio_projects (id, name, description, status, "ownerId", "createdAt", "updatedAt")
SELECT
  project_id,
  project_name,
  COALESCE(metamodel_description, 'Project for the ' || project_name || ' metamodel'),
  'ACTIVE',
  owner_id,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM mm_project;

INSERT INTO project_memberships (id, "projectId", "userId", role, "createdAt", "updatedAt")
SELECT gen_random_uuid(), project_id, owner_id, 'OWNER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM mm_project;

-- ---------------------------------------------------------------------------
-- 2. Give every metamodel its own EPackage.
-- ---------------------------------------------------------------------------
-- An EPackage row carries a single projectId, but 11 metamodels currently share
-- 4 core Ecore packages. Leaving that as-is would break the dependency-closure
-- invariant: buildManifest rejects a metamodel whose EPackage sits in another
-- project, which would disable checkpoints, evolution apply, and pipelines.
--
-- The first metamodel using a package keeps the original, but only when it also
-- owns it; otherwise the original stays with its creator and every other
-- metamodel receives a clone.

CREATE TEMPORARY TABLE epackage_plan ON COMMIT PRESERVE ROWS AS
SELECT
  m.id                AS metamodel_id,
  p.project_id,
  p.owner_id,
  e.id                AS epackage_id,
  e."userId"          AS epackage_owner_id,
  ROW_NUMBER() OVER (
    PARTITION BY e.id ORDER BY m."createdAt", m.id
  )                   AS use_rank
FROM metamodels m
JOIN mm_project p ON p.metamodel_id = m.id
JOIN e_packages e ON e.id = m."conformsToId";

-- Case A: the original moves into the project of its first, owning metamodel.
UPDATE e_packages e
SET "projectId" = plan.project_id
FROM epackage_plan plan
WHERE e.id = plan.epackage_id
  AND plan.use_rank = 1
  AND plan.epackage_owner_id = plan.owner_id;

-- Case B: everyone else gets a clone, attributed to the metamodel's owner.
CREATE TEMPORARY TABLE epackage_clone ON COMMIT PRESERVE ROWS AS
SELECT
  plan.metamodel_id,
  plan.project_id,
  plan.owner_id,
  plan.epackage_id,
  gen_random_uuid() AS clone_id
FROM epackage_plan plan
WHERE NOT (plan.use_rank = 1 AND plan.epackage_owner_id = plan.owner_id);

INSERT INTO e_packages (id, name, "nsURI", "nsPrefix", classes, "userId", "projectId", "createdAt", "updatedAt")
SELECT
  c.clone_id,
  e.name,
  -- nsURI is deliberately copied unchanged. Namespace identity is project-local
  -- (@@unique([projectId, nsURI])) and each clone lands in its own project, so
  -- the standard Ecore URI stays intact for EMF/XMI interchange.
  e."nsURI",
  e."nsPrefix",
  e.classes,
  c.owner_id,
  c.project_id,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM epackage_clone c
JOIN e_packages e ON e.id = c.epackage_id;

UPDATE metamodels m
SET "conformsToId" = c.clone_id
FROM epackage_clone c
WHERE m.id = c.metamodel_id;

-- ---------------------------------------------------------------------------
-- 3. Move every artifact that can reach a metamodel.
-- ---------------------------------------------------------------------------

UPDATE metamodels m
SET "projectId" = p.project_id
FROM mm_project p
WHERE p.metamodel_id = m.id;

UPDATE viewpoints v
SET "projectId" = p.project_id
FROM mm_project p
WHERE p.metamodel_id = v."metamodelId";

UPDATE models mo
SET "projectId" = p.project_id
FROM mm_project p
WHERE p.metamodel_id = mo."metamodelId";

UPDATE diagrams d
SET "projectId" = p.project_id
FROM models mo
JOIN mm_project p ON p.metamodel_id = mo."metamodelId"
WHERE mo.id = d."modelId";

UPDATE code_generation_projects c
SET "projectId" = p.project_id
FROM mm_project p
WHERE p.metamodel_id = c."targetMetamodelId";

-- ---------------------------------------------------------------------------
-- 4. Leftovers go to their owner's first metamodel project.
-- ---------------------------------------------------------------------------
-- Test cases whose model was deleted, transformation rules with no view, and
-- stored files have no semantic path to a metamodel. Owners without any
-- metamodel keep their Legacy Project, so those rows are left untouched.

CREATE TEMPORARY TABLE owner_home ON COMMIT PRESERVE ROWS AS
SELECT owner_id, project_id
FROM mm_project
WHERE owner_rank = 1;

UPDATE test_cases t
SET "projectId" = h.project_id
FROM owner_home h
WHERE h.owner_id = t."userId";

UPDATE transformation_rules r
SET "projectId" = h.project_id
FROM owner_home h
WHERE h.owner_id = r."userId";

UPDATE stored_files f
SET "projectId" = h.project_id
FROM owner_home h
WHERE h.owner_id = f."userId";

-- EPackages left unreferenced after cloning are leftovers too.
UPDATE e_packages e
SET "projectId" = h.project_id
FROM owner_home h
WHERE h.owner_id = e."userId"
  AND NOT EXISTS (SELECT 1 FROM metamodels m WHERE m."conformsToId" = e.id);

-- ---------------------------------------------------------------------------
-- 5. Keep cross-owner creators working.
-- ---------------------------------------------------------------------------
-- A few models and viewpoints were created by someone other than the metamodel
-- owner. Ownership follows the metamodel, so their creators are added as
-- members instead of silently losing access. DSL_DESIGNER wins when a user
-- qualifies for both roles.

INSERT INTO project_memberships (id, "projectId", "userId", role, "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  contributor."projectId",
  contributor."userId",
  -- A CASE result is text, so the enum cast is explicit here.
  (CASE WHEN bool_or(contributor.needs_design) THEN 'DSL_DESIGNER' ELSE 'MODELER' END)::"ProjectRole",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT v."projectId", v."userId", TRUE AS needs_design
  FROM viewpoints v
  JOIN studio_projects sp ON sp.id = v."projectId"
  WHERE v."userId" <> sp."ownerId"
  UNION ALL
  SELECT mo."projectId", mo."userId", FALSE
  FROM models mo
  JOIN studio_projects sp ON sp.id = mo."projectId"
  WHERE mo."userId" <> sp."ownerId"
) contributor
GROUP BY contributor."projectId", contributor."userId"
ON CONFLICT ("projectId", "userId") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Drop Legacy Projects that are now empty.
-- ---------------------------------------------------------------------------
-- Only projects emptied by this migration are removed. A Legacy Project that
-- still holds something, including one belonging to a user who never created a
-- metamodel, is kept.

DELETE FROM studio_projects sp
WHERE sp.name = 'Legacy Project'
  AND NOT EXISTS (SELECT 1 FROM e_packages               x WHERE x."projectId" = sp.id)
  AND NOT EXISTS (SELECT 1 FROM metamodels               x WHERE x."projectId" = sp.id)
  AND NOT EXISTS (SELECT 1 FROM viewpoints               x WHERE x."projectId" = sp.id)
  AND NOT EXISTS (SELECT 1 FROM models                   x WHERE x."projectId" = sp.id)
  AND NOT EXISTS (SELECT 1 FROM diagrams                 x WHERE x."projectId" = sp.id)
  AND NOT EXISTS (SELECT 1 FROM transformation_rules     x WHERE x."projectId" = sp.id)
  AND NOT EXISTS (SELECT 1 FROM code_generation_projects x WHERE x."projectId" = sp.id)
  AND NOT EXISTS (SELECT 1 FROM test_cases               x WHERE x."projectId" = sp.id)
  AND NOT EXISTS (SELECT 1 FROM stored_files             x WHERE x."projectId" = sp.id)
  AND NOT EXISTS (SELECT 1 FROM project_checkpoints      x WHERE x."projectId" = sp.id)
  AND NOT EXISTS (SELECT 1 FROM metamodel_migrations     x WHERE x."projectId" = sp.id)
  AND NOT EXISTS (SELECT 1 FROM pipeline_runs            x WHERE x."projectId" = sp.id);

DROP TABLE IF EXISTS mm_project;
DROP TABLE IF EXISTS epackage_plan;
DROP TABLE IF EXISTS epackage_clone;
DROP TABLE IF EXISTS owner_home;
