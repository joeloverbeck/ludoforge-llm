# FITLEVEAUTHAR-005: Update CLAUDE.md and AGENTS.md to reference cookbook instead of Spec 29

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — documentation only
**Deps**: FITLEVEAUTHAR-001

## Problem

`CLAUDE.md` and `AGENTS.md` list Spec 29 as the active event card encoding spec and implicitly treat it as the authoring reference. Once the cookbook (`docs/fitl-event-authoring-cookbook.md`) exists, these files should point authors to the cookbook for authoring guidance and note that Spec 29 is pending archival.

## Assumption Reassessment (2026-03-13)

1. `CLAUDE.md` references Spec 29 under "Active specs: 29 (FITL event card encoding)" — confirmed.
2. `AGENTS.md` does not currently contain an "Active specs" section or any stale `Spec 29`/`specs/29` authoring reference — confirmed by grep and file review.
3. `docs/fitl-event-authoring-cookbook.md` already exists and explicitly declares itself the canonical authoring reference — confirmed.
4. No other non-archived project guidance file currently treats Spec 29 as the living authoring guide; the remaining `Spec 29` references are roadmap/spec-history references and should not be rewritten by this ticket — confirmed by grep.

## Architecture Check

1. Pure documentation change — no code or runtime risk.
2. The durable architecture is: cookbook in `docs/` for authoring guidance, implementation specs in `specs/`, and repo-policy files (`AGENTS.md`, `CLAUDE.md`) only carrying the minimum stable pointers needed to route authors correctly.
3. Mirroring `CLAUDE.md`'s transient spec-status bookkeeping into `AGENTS.md` would be needless duplication. If `AGENTS.md` changes at all, it should gain only an evergreen cookbook pointer, not a copied "pending archival" lifecycle note.
4. No backwards-compatibility or aliasing concerns apply.

## What to Change

### 1. Update `CLAUDE.md`

- In the "Status" section, move Spec 29 from "Active specs" to "Pending archival" or a similar designation.
- Add a note pointing to `docs/fitl-event-authoring-cookbook.md` as the canonical FITL event authoring reference.
- Update the "Testing Requirements" section if it references Spec 29 for event card testing patterns.

### 2. Update `AGENTS.md`

- Do not add a copied "Active specs"/"Pending archival" status block.
- Add only a narrow, durable pointer that directs FITL event authors to `docs/fitl-event-authoring-cookbook.md` and makes clear Spec 29 is not the living authoring guide.

### 3. Grep for stale references

Search the repo for any other non-archived guidance files referencing `specs/29` as a living guide and update them if found. Do not rewrite roadmap/spec-history references, and exclude `specs/29` itself and `archive/` files.

## Files to Touch

- `CLAUDE.md` (modify)
- `AGENTS.md` (modify)
- Any other guidance files found by grepping for `specs/29` references (modify if applicable)

## Out of Scope

- Archiving `specs/29-fitl-event-card-encoding.md` itself — that is FITLEVEAUTHAR-006.
- Modifying the cookbook — that is locked from FITLEVEAUTHAR-001.
- Modifying any engine source code, game data, or test files.
- Updating memory files (`.claude/` project memory) — that happens naturally in session.
- Rewriting roadmap/spec dependency references that mention Spec 29 historically or structurally without treating it as the living authoring guide.

## Acceptance Criteria

### Tests That Must Pass

1. No tests are added or modified by this ticket (doc-only).
2. `pnpm run check:ticket-deps` — must pass after the ticket and archive move.
3. `pnpm turbo test --force` — must remain green.
4. `pnpm turbo lint --force` — must remain green.

### Invariants

1. No source code or game data files are changed — `git diff --stat` shows only `.md` documentation files.
2. `CLAUDE.md` no longer presents Spec 29 as an active spec and points readers to `docs/fitl-event-authoring-cookbook.md` as the living FITL event authoring reference.
3. `AGENTS.md` contains a durable cookbook pointer without duplicating transient spec-lifecycle status.
4. No non-archived guidance file still treats `specs/29-fitl-event-card-encoding.md` as the living authoring guide.

## Test Plan

### New/Modified Tests

1. None — documentation only.

### Commands

1. `pnpm run check:ticket-deps`
2. `pnpm turbo test --force`
3. `pnpm turbo lint --force`

## Outcome

- Completion date: 2026-03-13
- What actually changed:
  - Reassessed the ticket against the live repo state before implementation.
  - Updated `CLAUDE.md` so Spec 29 is no longer listed as active and now points readers to `docs/fitl-event-authoring-cookbook.md` as the living FITL event authoring reference.
  - Added a narrow cookbook pointer to `AGENTS.md` without introducing duplicated spec-lifecycle bookkeeping there.
- Deviations from original plan:
  - The original ticket assumed `AGENTS.md` already had a stale Spec 29 "Active specs" reference. It did not.
  - Instead of mirroring `CLAUDE.md`'s status bookkeeping into `AGENTS.md`, the implemented change kept `AGENTS.md` evergreen and limited it to a durable cookbook pointer. This is cleaner and avoids turning a stable policy file into a second transient project-status ledger.
  - No additional non-archived guidance files required updates after grep verification.
- Verification results:
  - `pnpm run check:ticket-deps` ✅
  - `pnpm turbo test --force` ✅
  - `pnpm turbo lint --force` ✅
  - No tests were added or modified because the ticket remained documentation-only after reassessment.
