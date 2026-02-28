# ENGINEARCH-125: Ticket Dependency Reference Integrity and Archive Path Normalization

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — ticket/process tooling only
**Deps**: tickets/README.md, docs/archival-workflow.md, tickets/ENGINEARCH-111-unify-query-runtime-shape-inference-surface.md

## Problem

Active ticket dependency references can break when source tickets are archived (for example `tickets/ENGINEARCH-111...` still points to `tickets/ENGINEARCH-109...` after `ENGINEARCH-109` moved to `archive/tickets/...`). Broken deps reduce planning reliability and can hide missing preconditions.

## Assumption Reassessment (2026-02-28)

1. `tickets/ENGINEARCH-111-unify-query-runtime-shape-inference-surface.md` currently references a non-existent active dependency path.
2. `tickets/README.md` requires dependency references to point to existing repository files, but no automated validation currently enforces this.
3. Corrected scope: fix existing broken deps and add a lightweight repository-level dependency checker so archive moves cannot silently break active ticket dependency graphs.

## Architecture Check

1. Dependency-integrity checks are cleaner and more robust than manual spot-checking because they provide deterministic failure on broken planning links.
2. This work is repository-process only; it does not alter GameDef, simulator, runtime, or GameSpecDoc semantics.
3. No backwards-compatibility aliasing/shims: canonical dependency paths must exist as written.

## What to Change

### 1. Repair current broken dependency references

Update active tickets that reference archived files via stale `tickets/...` paths to explicit existing paths (`archive/tickets/...` when archived).

### 2. Add dependency integrity checker

Add a script that parses active ticket `**Deps**` entries and fails if any declared path does not exist.

### 3. Integrate checker into local workflow

Add a documented command and wire it into an existing quality gate (or dedicated CI step) so broken dependencies are caught before merge.

## Files to Touch

- `tickets/ENGINEARCH-111-unify-query-runtime-shape-inference-surface.md` (modify)
- `scripts/check-ticket-deps.mjs` (new)
- `tickets/README.md` (modify)
- `package.json` (modify, if command wiring is needed)
- `scripts/test/check-ticket-deps.test.mjs` (new)

## Out of Scope

- Semantic validation of whether a dependency is the "right" one architecturally.
- Archiving workflow changes beyond dependency-path correctness checks.

## Acceptance Criteria

### Tests That Must Pass

1. Checker fails on a non-existent `**Deps**` path and reports the exact ticket file + missing path.
2. Checker passes when dependencies resolve to existing `tickets/...`, `archive/tickets/...`, `specs/...`, or other repo files.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Every active ticket dependency path resolves to an existing repository file.
2. Archive moves cannot silently break active dependency graphs without failing checks.

## Test Plan

### New/Modified Tests

1. `scripts/test/check-ticket-deps.test.mjs` — validates pass/fail behavior for valid and invalid dependency path fixtures.
2. `tickets/ENGINEARCH-111-unify-query-runtime-shape-inference-surface.md` — corrected dependency path acts as live regression input for checker pass.

### Commands

1. `node --test scripts/test/check-ticket-deps.test.mjs`
2. `node scripts/check-ticket-deps.mjs`
3. `pnpm -F @ludoforge/engine test`
