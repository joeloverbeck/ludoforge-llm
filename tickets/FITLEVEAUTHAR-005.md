# FITLEVEAUTHAR-005: Update CLAUDE.md and AGENTS.md to reference cookbook instead of Spec 29

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — documentation only
**Deps**: FITLEVEAUTHAR-001 (cookbook exists)

## Problem

`CLAUDE.md` and `AGENTS.md` list Spec 29 as the active event card encoding spec and implicitly treat it as the authoring reference. Once the cookbook (`docs/fitl-event-authoring-cookbook.md`) exists, these files should point authors to the cookbook for authoring guidance and note that Spec 29 is pending archival.

## Assumption Reassessment (2026-03-13)

1. `CLAUDE.md` references Spec 29 under "Active specs: 29 (FITL event card encoding)" — confirmed.
2. `AGENTS.md` references Spec 29 under "Active specs: 29 (FITL event card encoding)" — confirmed.
3. No other project guidance files reference Spec 29 as an authoring guide — to be verified during implementation (grep for `specs/29` and `Spec 29`).
4. `docs/fitl-event-authoring-cookbook.md` will exist after FITLEVEAUTHAR-001 — assumed (dependency).

## Architecture Check

1. Pure documentation change — no code risk.
2. Maintains the distinction between specs (implementation tracking) and docs (durable reference).
3. No backwards-compatibility concerns.

## What to Change

### 1. Update `CLAUDE.md`

- In the "Status" section, move Spec 29 from "Active specs" to "Pending archival" or a similar designation.
- Add a note pointing to `docs/fitl-event-authoring-cookbook.md` as the canonical FITL event authoring reference.
- Update the "Testing Requirements" section if it references Spec 29 for event card testing patterns.

### 2. Update `AGENTS.md`

- Mirror the same changes as `CLAUDE.md`: move Spec 29 from active to pending archival, add cookbook reference.

### 3. Grep for stale references

Search the repo for any other files referencing `specs/29` as a living guide and update them if found. Exclude `specs/29` itself and archive/ files.

## Files to Touch

- `CLAUDE.md` (modify)
- `AGENTS.md` (modify)
- Any other guidance files found by grepping for `specs/29` references (modify if applicable)

## Out of Scope

- Archiving `specs/29-fitl-event-card-encoding.md` itself — that is FITLEVEAUTHAR-006.
- Modifying the cookbook — that is locked from FITLEVEAUTHAR-001.
- Modifying any engine source code, game data, or test files.
- Updating memory files (`.claude/` project memory) — that happens naturally in session.

## Acceptance Criteria

### Tests That Must Pass

1. No tests are added or modified by this ticket (doc-only).
2. Existing suite: `pnpm -F @ludoforge/engine test` — must remain green.

### Invariants

1. No source code or game data files are changed — `git diff --stat` shows only `.md` documentation files.
2. `CLAUDE.md` and `AGENTS.md` no longer present Spec 29 as the active authoring reference.
3. `CLAUDE.md` and `AGENTS.md` include a clear pointer to `docs/fitl-event-authoring-cookbook.md`.
4. No stale `specs/29` references remain in non-archived guidance files.

## Test Plan

### New/Modified Tests

1. None — documentation only.

### Commands

1. `pnpm -F @ludoforge/engine build` (sanity check)
2. `pnpm -F @ludoforge/engine test` (confirm no regressions)
