# Phase 20 · Guided checkpoint restore

**Status** Implemented.

Project owners can restore a checkpoint from Project History after reviewing
the effect on the current project.

- [x] List which artifacts a restore will recreate, replace, or remove, and
  show changes to the project name or description.
- [x] Require explicit confirmation and compare the reviewed live and target
  hashes before writing.
- [x] Save a recovery checkpoint, restore project artifacts, and verify the
  restored graph within a single transaction.
- [x] Reload the project workspace and link to the recovery checkpoint.

Browser and route tests cover owner access, confirmation, stale previews, and
matching checkpoints. PostgreSQL integration tests cover recovery and rollback
when an artifact ID belongs to another project.
