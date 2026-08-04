-- Repair the generated descriptions that leaked a disambiguation suffix.
--
-- The per-metamodel split built a fallback description from the project name.
-- For metamodels whose name was duplicated under one owner, the project name
-- already carried a " (n)" suffix, so the sentence read
-- "Project for the newmetamodel (1) metamodel". The suffix belongs to the
-- project name only, never to the metamodel it describes.
--
-- Only rows still holding the exact generated sentence are touched, so a
-- description someone has since edited is left alone.

UPDATE studio_projects p
SET description = 'Project for the ' || m.name || ' metamodel'
FROM metamodels m
WHERE m."projectId" = p.id
  AND p.description = 'Project for the ' || p.name || ' metamodel'
  AND p.name <> m.name;
