# Project Lifecycle Guide

This guide covers the versioned side of a Studio Project: capturing checkpoints,
evolving a metamodel without breaking the models that conform to it, and running
reproducible pipelines on the server.

Open **Project History** in the project sidebar to browse checkpoints and review
pipeline runs. The **Checkpoints** tab compares a saved checkpoint with the
current project or an earlier checkpoint. Project roles with checkpoint creation
access can also capture a checkpoint from that tab. The **Pipeline runs** tab
lets you start runs and shows their status, step results, and recorded output.
Open **Metamodel Evolution** from a metamodel's actions menu to review or apply
a migration. Project owners can restore a checkpoint from **Project History**.

## Studio Projects

A Studio Project is the workspace that owns your metamodels, viewpoints, models,
views, transformations, generator configurations, tests, and files. Every
artifact belongs to exactly one project, and you work inside one project at a
time.

Project membership decides what you can do:

| Project role | Typical use |
| --- | --- |
| `VIEWER` | Read the project. |
| `MODELER` | Build and change models and views, and run pipelines. |
| `DSL_DESIGNER` | Everything a modeler can do, plus author the language, take checkpoints, and evolve metamodels. |
| `OWNER` | Everything, plus manage members, settings, archiving, and checkpoint restore. |

These project roles are separate from the platform-wide role. Being a platform
`ADMIN` gives you owner-level access to any project; being a platform
`DSL_DESIGNER` does not, on its own, let you into a project you are not a member
of. Conversely, a platform `VIEWER` (the role of a newly registered account)
becomes `OWNER` of every project it creates and has full rights there.

Archiving a project makes it read-only rather than deleting it. Reads still
work; writes are refused until the project is restored.

## Checkpoints

A checkpoint is an immutable snapshot of the project's artifact graph. It is not
a database backup: it captures the modeling artifacts and their dependency
relationships, hashed so that you can prove two states are identical.

### What a checkpoint contains

Building a checkpoint walks the project in dependency order (EPackages,
metamodels, viewpoints, models, views, then transformations, generators, tests,
and files) and records each artifact with its own content hash plus the
references it depends on. The whole manifest gets a root hash.

Two properties follow from this:

- **Determinism.** An unchanged project always produces the same root hash. Key
  order and negative zero are normalized before hashing, so cosmetic differences
  never change the result.
- **Dependency closure.** If an artifact references something outside the
  project, building the manifest fails instead of producing a snapshot that
  cannot be restored.

### Taking and comparing checkpoints

Take a checkpoint before anything you might want to undo: a metamodel migration,
a bulk model edit, a release. Give it a tag so it is findable later.

```bash
curl -X POST "$API/projects/$PROJECT_ID/lifecycle/checkpoints" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"tag":"before-rename","message":"Baseline before the attribute rename"}'
```

Checkpoints are sequential and immutable. Nothing rewrites one after it is
created.

To see what changed since a checkpoint, diff it. With no `against` parameter the
comparison is against the project's live state; pass another checkpoint ID to
compare two snapshots. The result lists added, removed, and changed artifacts
plus a count of the unchanged ones.

### Recovery semantics

1. In **Project History → Checkpoints**, select the checkpoint and choose
   **Review restore**.
2. Review which artifacts Studio will restore, replace, or remove, plus any
   changes to the project name or description.
3. Confirm and choose **Restore checkpoint**. If the project has changed since
   the preview, refresh the preview and review the changes again.
4. Studio reloads the project. Choose **View recovery checkpoint** to open
   the snapshot captured just before the restore.

- Studio checks the reviewed checkpoint and live project hashes before writing.
- The stored manifest is re-verified against its own hashes before any write. If
  a per-artifact hash or the root hash no longer matches, nothing is written.
- The restore is a single transaction. Artifacts absent from the checkpoint are
  deleted, artifacts in it are written back, and the project name and
  description are reset to their snapshot values. The recovery checkpoint
  commits with those changes.
- **Membership, project roles, and sharing are never restored.** Rolling a
  project back to March must not restore access for someone removed in April.
  Authorization state deliberately lives outside the versioned graph.
- Restoring the recovery checkpoint brings back the artifacts from before the
  restore.
- After a successful restore, rebuilding the graph produces the same root hash
  as the checkpoint.

Only a project owner (or a platform admin) can restore an active project.

## Metamodel evolution

Changing a published metamodel is the moment where MDE projects usually break:
the language moves and the models that conform to it silently stop making sense.
Evolution turns that into an explicit, previewable operation.

1. Open **Metamodels**, then choose **Metamodel Evolution** from the selected
   metamodel's actions menu.
2. Stage class or attribute changes, or load a proposed JSON export for the
   same metamodel. Keep IDs stable for classes and features you intend to edit.
3. Click **Preview migration** and review the affected artifacts and blockers.
   Select any applicable migration rules and preview again.
4. Choose **Review and apply** when the preview has no blockers. Confirm the
   migration and use **View recovery checkpoint** to open its checkpoint in
   Project History.

### Preview before you migrate

Preview compares the stored metamodel against the version you propose, matching
classes and features by their stable IDs rather than by name. That is what lets
it tell a rename apart from a delete-plus-add.

The report has four parts:

- **Changes**: each classified by kind (class added/removed/renamed, attribute
  added/removed/renamed, type or cardinality changed, and the reference
  equivalents) and flagged as breaking or non-breaking.
- **Impacts**: which models, viewpoints, transformations, generators, and tests
  are affected, and why.
- **Blockers**: what stops the migration until you say what should happen. A
  class that still has instances, an attribute rename that would overwrite
  existing values, a newly required attribute with no default, or a
  transformation that consumes a removed element all block the apply.
- **Warnings**: things worth knowing that do not block.

Preview changes nothing. Run it as often as you like.

### Migration rules

Blockers are cleared by stating an explicit rule, not by a flag that forces the
change through:

| Rule | Effect |
| --- | --- |
| `rename-attribute` | Moves instance values from the old attribute name to the new one. |
| `remove-attribute` | Drops the attribute and its instance values. |
| `remove-class` | Removes the class; needs `deleteInstances: true` when instances exist. |

An unsafe deletion with no matching rule stays blocked. The system will not
guess what you meant.

### Applying

Apply requires `expectedSourceHash`, taken from the preview you reviewed. If the
metamodel changed in the meantime, the apply is rejected with a conflict and you
re-run the preview. A stale plan is never applied to a moved target.

Before touching anything, apply creates a checkpoint and stores its ID on the
migration record. The metamodel change and every model migration then happen in
one transaction, and the source metamodel is re-checked inside that transaction.
If the migration turns out wrong, restore the checkpoint referenced by
`sourceCheckpointId`.

Migration history is retained per metamodel, including the report, the rules, the
per-model counts of changed and deleted elements, and the recovery checkpoint.

## Headless pipelines

A pipeline runs validation, transformations, model tests, and code generation on
the server, with retained evidence and a deterministic hash. This is what makes
model quality checkable in CI rather than only in a browser tab.

### Running in Studio

1. Open **Project History → Pipeline runs** and choose **New pipeline run**.
2. Name the run and optionally tag its source checkpoint.
3. Add and order the steps. Select a model for each step, a compatible code
   generation project for generation, and an enabled rule for transformations.
4. Confirm model writes if the pipeline includes a transformation. Completed
   transformations save their changes even if a later step fails.
5. Choose **Run pipeline**. The run opens in history with its result, recorded step
   output, and a link to the source checkpoint.

Viewers can review the history. Modelers, DSL designers, and owners can start
runs in active projects.

### Defining a run

A definition is a name plus an ordered list of steps:

```json
{
  "name": "Warehouse gate",
  "checkpointTag": "ci",
  "steps": [
    { "id": "validate", "kind": "validate-model", "modelId": "<model-id>" },
    { "id": "tests", "kind": "run-tests", "modelId": "<model-id>" },
    {
      "id": "usd",
      "kind": "generate",
      "modelId": "<model-id>",
      "codegenProjectId": "<codegen-project-id>"
    }
  ]
}
```

`apply-transformation` is the fourth step kind; it takes a `ruleId` and an
optional `maxIterations`.

### Execution and evidence

- The server captures a source checkpoint before the first step. Steps read
  saved project artifacts, and later steps see any changes saved by earlier
  transformations.
- Steps run in order and stop at the first failure. The results of the steps that
  already completed are still retained, so a failure tells you how far the run
  got.
- Each run gets a content hash. Identical source checkpoint hashes, normalized
  definitions, and step results produce the same run hash.
- Retained runs are listable and individually readable, including step output.

### Running from CI

The CLI posts a definition file and exits non-zero when the run does not
succeed, which is what a CI job needs:

```bash
cd backend
npm run pipeline -- \
  --project <project-id> \
  --definition ./pipeline.json \
  --api https://dsl-studio.micss-lab.be/api \
  --token "$SPATIALDSL_TOKEN"
```

`--api` falls back to `SPATIALDSL_API_URL` and then to
`http://localhost:3002/api`; `--token` falls back to `SPATIALDSL_TOKEN`. The run
JSON is written to stdout so a CI job can archive it.

Note the distinction between transport and outcome: the REST endpoint returns
`201` for a failed run, because the request itself succeeded. Read the run's
`status` field to decide whether the model passed. The CLI already does this and
maps it to its exit code.

### Capabilities

Running a pipeline needs `pipeline.execute`, which modelers hold. Taking a
checkpoint needs `checkpoint.create` (DSL designers), restoring one needs
`checkpoint.restore` (owners), and evolving a metamodel needs `metamodel.evolve`
(DSL designers). A CI token therefore only needs modeler-level membership.

## Related docs

- [API Reference](../reference/api.md)
- [Roles and Sharing](roles-and-sharing.md)
- [Metamodels](metamodels.md)
- [Data Model](../reference/data-model.md)
