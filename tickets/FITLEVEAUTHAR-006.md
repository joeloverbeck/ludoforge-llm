# FITLEVEAUTHAR-006: Archive Spec 29 (FITL event card encoding)

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — documentation/archival only
**Deps**: FITLEVEAUTHAR-001 (cookbook replaces guidance), FITLEVEAUTHAR-005 (references updated)

## Problem

`specs/29-fitl-event-card-encoding.md` was the implementation tracker for FITL event card encoding. Its living guidance has been migrated to the cookbook (FITLEVEAUTHAR-001) and its references in `CLAUDE.md`/`AGENTS.md` have been updated (FITLEVEAUTHAR-005). The spec should now be archived following the canonical archival workflow in `docs/archival-workflow.md`.

## Assumption Reassessment (2026-03-13)

1. `specs/29-fitl-event-card-encoding.md` exists — confirmed.
2. `docs/archival-workflow.md` defines the canonical archival procedure — confirmed (referenced in CLAUDE.md).
3. After FITLEVEAUTHAR-001 and FITLEVEAUTHAR-005, no guidance files should reference Spec 29 as a living document — assumed (dependency).
4. The `archive/` directory is the standard destination for completed specs — confirmed by CLAUDE.md listing archived specs.

## Architecture Check

1. Pure archival operation — move file, no content changes.
2. Follows established `docs/archival-workflow.md` procedure.
3. No backwards-compatibility concerns.

## What to Change

### 1. Archive `specs/29-fitl-event-card-encoding.md`

Follow the canonical archival workflow in `docs/archival-workflow.md`:

- Move `specs/29-fitl-event-card-encoding.md` to the archive location.
- Update any archival index or manifest if the workflow requires it.
- Update `CLAUDE.md` to move Spec 29 from "Pending archival" (set by FITLEVEAUTHAR-005) to "Completed specs (archived)" list.
- Update `AGENTS.md` similarly.

### 2. Final reference sweep

One last grep for `specs/29` across the repo to confirm no stale references remain outside of archive/.

## Files to Touch

- `specs/29-fitl-event-card-encoding.md` (move to archive)
- `CLAUDE.md` (modify — move Spec 29 to archived list)
- `AGENTS.md` (modify — move Spec 29 to archived list)
- Archive index/manifest files per `docs/archival-workflow.md` (modify if applicable)

## Out of Scope

- Modifying the cookbook or macros — those are locked from earlier tickets.
- Modifying any engine source code, game data, or test files.
- Re-implementing any Spec 29 deliverables — all implementation is complete.

## Acceptance Criteria

### Tests That Must Pass

1. No tests are added or modified by this ticket (archival-only).
2. Existing suite: `pnpm -F @ludoforge/engine test` — must remain green.

### Invariants

1. No source code or game data files are changed.
2. `specs/29-fitl-event-card-encoding.md` no longer exists under `specs/` — it is in `archive/`.
3. `CLAUDE.md` and `AGENTS.md` list Spec 29 under completed/archived specs, not active specs.
4. No non-archived file in the repo references `specs/29` as a living document.
5. Archival follows the procedure defined in `docs/archival-workflow.md` exactly.

## Test Plan

### New/Modified Tests

1. None — archival only.

### Commands

1. `pnpm -F @ludoforge/engine build` (sanity check)
2. `pnpm -F @ludoforge/engine test` (confirm no regressions)
