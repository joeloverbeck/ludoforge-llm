# FITLEVEAUTHAR-006: Archive Spec 29 (FITL event card encoding)

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — documentation/archival only
**Deps**: FITLEVEAUTHAR-001, FITLEVEAUTHAR-005

## Problem

Spec 29 was the implementation tracker for FITL event card encoding. Its living guidance was migrated to the cookbook by FITLEVEAUTHAR-001, and FITLEVEAUTHAR-005 updated the repository guidance to stop treating Spec 29 as the living authoring guide. This ticket completed the archival pass using the canonical workflow in `docs/archival-workflow.md`.

## Assumption Reassessment (2026-03-13)

1. The Spec 29 source existed under `specs/29-fitl-event-card-encoding.md` before archival — confirmed.
2. `docs/archival-workflow.md` defines the canonical archival procedure — confirmed (referenced in CLAUDE.md).
3. After FITLEVEAUTHAR-001 and FITLEVEAUTHAR-005, no guidance file should treat Spec 29 as the living FITL event-authoring reference — confirmed. `AGENTS.md` already points readers to `docs/fitl-event-authoring-cookbook.md`.
4. Active non-archived files still contain legitimate historical or path-sensitive references to Spec 29 — confirmed. These include `CLAUDE.md` (`Pending archival`), `AGENTS.md` (historical path reference), and `specs/62-fitl-event-authoring-hardening.md` (explicit path references that would go stale after archival).
5. The archival workflow applies to specs as well as tickets — confirmed. Spec 29 itself must be marked completed and gain an `Outcome` section before being moved to `archive/specs/`.
6. The canonical archival workflow requires the collision-safe archive script and a post-move dependency check — confirmed via `docs/archival-workflow.md` and `package.json` (`pnpm run check:ticket-deps`).

## Architecture Check

1. Archiving Spec 29 is beneficial to the current architecture. It reinforces the intended split: long-lived authoring guidance lives in `docs/fitl-event-authoring-cookbook.md`, while numbered specs remain implementation trackers and historical records.
2. This should remain a documentation/archival operation. No engine, compiler, kernel, macro, or game-data changes are justified here.
3. Historical references to Spec 29 should remain where they are semantically useful, but path-sensitive references must be updated so the archive result is internally consistent.
4. No backwards-compatibility aliases are needed. We should update references to the canonical archived path or to cookbook guidance directly, and let stale paths fail fast.

## What to Change

### 1. Archive Spec 29

Follow the canonical archival workflow in `docs/archival-workflow.md`:

- Update `specs/29-fitl-event-card-encoding.md` itself for archival:
  - mark it completed at the top
  - add a bottom `Outcome` section with completion date, what actually changed, deviations from original plan, and verification results
- Move it with `node scripts/archive-ticket.mjs specs/29-fitl-event-card-encoding.md archive/specs/`.
- Update `CLAUDE.md` to move Spec 29 from `Pending archival` into the completed archived-specs list.

### 2. Update non-archived path-sensitive references

Update any active non-archived file whose exact path reference would become stale after the move. At minimum, reassess:

- `AGENTS.md`
- `specs/62-fitl-event-authoring-hardening.md`

Do not rewrite historical references that intentionally refer to Spec 29 as historical implementation work rather than as the living guide.

### 3. Verification sweep

After the move, grep for stale `specs/29-fitl-event-card-encoding.md` references outside `archive/` and resolve only true stale-path references. Then run the archival integrity check required by workflow.

## Files to Touch

- `specs/29-fitl-event-card-encoding.md` (modify for archival, then move to `archive/specs/`)
- `CLAUDE.md` (modify — move Spec 29 to archived list)
- `AGENTS.md` (modify — update path only if needed after archival)
- `specs/62-fitl-event-authoring-hardening.md` (modify — update stale explicit path references if needed)
- Any other active non-archived file discovered by grep to contain a stale exact path reference to `specs/29-fitl-event-card-encoding.md`

## Out of Scope

- Modifying the cookbook or macros — those are locked from earlier tickets.
- Modifying any engine source code, game data, or test files.
- Re-implementing any Spec 29 deliverables — the implementation work is already complete and this ticket should only document/archive it accurately.
- Rewriting historical roadmap/spec references that mention “Spec 29” conceptually without depending on the old on-disk path.

## Acceptance Criteria

### Tests That Must Pass

1. No production tests are expected to be added or modified by this ticket unless the archival workflow itself exposes a broken repository invariant.
2. `pnpm run check:ticket-deps`
3. Existing suite: `pnpm -F @ludoforge/engine test` — must remain green.

### Invariants

1. No source code or game data files are changed.
2. `specs/29-fitl-event-card-encoding.md` no longer exists under `specs/` — it is in `archive/`.
3. Archived Spec 29 is marked completed and includes an `Outcome` section that reflects what actually landed.
4. `CLAUDE.md` no longer lists Spec 29 as pending archival.
5. No active non-archived file retains the stale exact path `specs/29-fitl-event-card-encoding.md` unless it is intentionally discussing the pre-archive path as historical context.
6. No non-archived guidance file presents Spec 29 as the living FITL event-authoring guide.
7. Archival follows the procedure defined in `docs/archival-workflow.md` exactly.

## Test Plan

### New/Modified Tests

1. None expected — archival/documentation only unless repo-integrity checks expose a gap.

### Commands

1. `node scripts/archive-ticket.mjs specs/29-fitl-event-card-encoding.md archive/specs/`
2. `pnpm run check:ticket-deps`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- **Completion date**: 2026-03-13
- **What actually changed**: Reassessed and corrected the ticket scope before implementation; updated Spec 29 itself for archival (`COMPLETED` status plus `Outcome`); moved Spec 29 to `archive/specs/` with the canonical archive script; updated `CLAUDE.md`, `AGENTS.md`, and `specs/62-fitl-event-authoring-hardening.md` so active references remain architecturally accurate after the move.
- **Deviations from original plan**: The original ticket understated the work. `AGENTS.md` did not have an archived-spec list to maintain, while the real archival surface also included Spec 29’s own status/outcome requirements and stale explicit path references in `specs/62-fitl-event-authoring-hardening.md`. No engine, macro, or game-data changes were warranted.
- **Verification results**: `pnpm run check:ticket-deps` passed; `pnpm -F @ludoforge/engine test` passed (352/352); `pnpm turbo lint` passed.
